import { findByPropsLazy, findStoreLazy } from "@webpack";
import { RelationshipStore, RestAPI, UserStore } from "@webpack/common";
import * as DataStore from "@api/DataStore";

import { BACKUP_VERSION, ProfileBackup } from "./types";

const GuildStore = findStoreLazy("GuildStore");
const GuildChannelStore = findStoreLazy("GuildChannelStore");
const UserSettingsProtoStore = findStoreLazy("UserSettingsProtoStore");

const DATASTORE_KEY = "ProfileBackup_latestBackup";
const DATASTORE_TIMESTAMP_KEY = "ProfileBackup_lastBackupTime";
const DATASTORE_INVITE_CACHE_KEY = "ProfileBackup_inviteCache";

async function fetchImageAsBase64(url: string): Promise<string | null> {
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function getCustomStatus(): Promise<ProfileBackup["customStatus"]> {
    try {
        const resp = await RestAPI.get({ url: "/users/@me/settings" });
        const cs = resp.body?.custom_status;
        if (!cs || !cs.text) return null;
        return {
            text: cs.text,
            emojiName: cs.emoji_name ?? null,
            expiresAt: cs.expires_at ?? null,
        };
    } catch {
        return null;
    }
}

async function getFavoriteGifs(): Promise<string[]> {
    // Method 1: UserSettingsProtoStore (most reliable, where Discord actually stores them)
    try {
        const frecency = UserSettingsProtoStore?.frecencyWithoutFetchingLatest;
        const favoriteGifs = frecency?.favoriteGifs?.gifs;
        if (favoriteGifs && typeof favoriteGifs === "object") {
            // Sort by order field to preserve the user's arrangement
            return Object.entries(favoriteGifs)
                .sort(([, a]: [string, any], [, b]: [string, any]) => (a.order ?? 0) - (b.order ?? 0))
                .map(([url]) => url);
        }
    } catch { }

    // Method 2: Proto REST endpoint
    try {
        const resp = await RestAPI.get({ url: "/users/@me/settings-proto/2" });
        if (resp.body) {
            // Response may be base64-encoded protobuf, try to parse
            const favoriteGifs = resp.body?.favoriteGifs?.gifs;
            if (favoriteGifs) {
                return Object.keys(favoriteGifs);
            }
        }
    } catch { }

    // Method 3: Legacy settings endpoint
    try {
        const resp = await RestAPI.get({ url: "/users/@me/settings" });
        const frecency = resp.body?.frecency?.favoriteGifs;
        if (frecency) return Object.keys(frecency);
    } catch { }

    return [];
}

function getFriends(): ProfileBackup["friends"] {
    const relationships = RelationshipStore.getMutableRelationships();
    const friends: ProfileBackup["friends"] = [];

    for (const [userId, type] of relationships) {
        if (type !== 1) continue; // 1 = friend
        const user = UserStore.getUser(userId);
        if (user) {
            friends.push({
                id: userId,
                username: user.username,
                displayName: user.globalName ?? user.username,
            });
        }
    }
    return friends;
}

// Load cached invite codes (keyed by guild ID)
async function getInviteCache(): Promise<Record<string, string>> {
    return await DataStore.get(DATASTORE_INVITE_CACHE_KEY) ?? {};
}

async function saveInviteCache(cache: Record<string, string>): Promise<void> {
    await DataStore.set(DATASTORE_INVITE_CACHE_KEY, cache);
}

async function getGuildInvite(guildId: string, cache: Record<string, string>): Promise<string | null> {
    // Use cached invite if we already have one for this guild ID
    if (cache[guildId]) return cache[guildId];

    try {
        const guild = GuildStore.getGuild(guildId);
        if (guild?.vanityURLCode) {
            cache[guildId] = guild.vanityURLCode;
            return guild.vanityURLCode;
        }

        // Create a permanent invite on the first available text channel
        const channels = GuildChannelStore.getChannels(guildId);
        const textChannels = channels?.SELECTABLE?.map((c: any) => c.channel) ?? [];

        for (const channel of textChannels) {
            try {
                const resp = await RestAPI.post({
                    url: `/channels/${channel.id}/invites`,
                    body: {
                        max_age: 0,
                        max_uses: 0,
                        temporary: false,
                    },
                });
                if (resp.body?.code) {
                    cache[guildId] = resp.body.code;
                    return resp.body.code;
                }
            } catch {
                continue;
            }
        }
        return null;
    } catch {
        return null;
    }
}

export async function collectBackup(
    onProgress?: (status: string) => void
): Promise<ProfileBackup> {
    const currentUser = UserStore.getCurrentUser();

    onProgress?.("Fetching profile data...");
    const profileResp = await RestAPI.get({ url: "/users/@me" });
    const profile = profileResp.body;

    onProgress?.("Downloading avatar...");
    let avatarBase64: string | null = null;
    if (profile.avatar) {
        const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
        const url = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}?size=512`;
        avatarBase64 = await fetchImageAsBase64(url);
    }

    onProgress?.("Downloading banner...");
    let bannerBase64: string | null = null;
    if (profile.banner) {
        const ext = profile.banner.startsWith("a_") ? "gif" : "png";
        const url = `https://cdn.discordapp.com/banners/${profile.id}/${profile.banner}.${ext}?size=600`;
        bannerBase64 = await fetchImageAsBase64(url);
    }

    onProgress?.("Fetching custom status...");
    const customStatus = await getCustomStatus();

    onProgress?.("Fetching favorite GIFs...");
    const favoriteGifs = await getFavoriteGifs();

    onProgress?.("Collecting friends list...");
    const friends = getFriends();

    onProgress?.("Collecting server list and creating invites...");
    const guilds: ProfileBackup["guilds"] = [];
    const allGuilds = Object.values(GuildStore.getGuilds()) as any[];

    // Load cached invites so we don't recreate them every backup
    const inviteCache = await getInviteCache();
    let newInvitesCreated = 0;

    for (const guild of allGuilds) {
        // Only fetch/create invite if not already cached for this guild ID
        if (!inviteCache[guild.id]) {
            onProgress?.(`Creating invite for: ${guild.name}...`);
            newInvitesCreated++;
        }
        const inviteCode = await getGuildInvite(guild.id, inviteCache);
        const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;

        guilds.push({
            id: guild.id,
            name: guild.name,
            inviteCode,
            iconUrl,
        });
    }

    // Save updated invite cache
    await saveInviteCache(inviteCache);
    if (newInvitesCreated > 0) {
        onProgress?.(`Created ${newInvitesCreated} new invite(s), ${Object.keys(inviteCache).length} total cached`);
    }

    const backup: ProfileBackup = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        sourceUser: {
            id: currentUser.id,
            username: currentUser.username,
        },
        profile: {
            bio: profile.bio ?? "",
            pronouns: profile.pronouns ?? "",
            avatar: avatarBase64,
            banner: bannerBase64,
            accentColor: profile.accent_color ?? null,
        },
        customStatus,
        favoriteGifs,
        friends,
        guilds,
    };

    return backup;
}

export async function saveBackupToDataStore(backup: ProfileBackup): Promise<void> {
    await DataStore.set(DATASTORE_KEY, backup);
    await DataStore.set(DATASTORE_TIMESTAMP_KEY, Date.now());
}

export async function loadBackupFromDataStore(): Promise<ProfileBackup | null> {
    return await DataStore.get(DATASTORE_KEY) ?? null;
}

export async function getLastBackupTime(): Promise<number | null> {
    return await DataStore.get(DATASTORE_TIMESTAMP_KEY) ?? null;
}

export function downloadBackupAsFile(backup: ProfileBackup): void {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discord-backup-${backup.sourceUser.username}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
