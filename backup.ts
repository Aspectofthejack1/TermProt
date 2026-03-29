import { findByPropsLazy, findStoreLazy } from "@webpack";
import { RelationshipStore, RestAPI, UserStore } from "@webpack/common";
import * as DataStore from "@api/DataStore";

import { BACKUP_VERSION, ProfileBackup } from "./types";

const GuildStore = findStoreLazy("GuildStore");
const GuildChannelStore = findStoreLazy("GuildChannelStore");
const UserSettingsProtoStore = findStoreLazy("UserSettingsProtoStore");
const ProtoSettingsModule = findByPropsLazy("ProtoClass", "getCurrentValue");

const DATASTORE_KEY = "ProfileBackup_latestBackup";
const DATASTORE_TIMESTAMP_KEY = "ProfileBackup_lastBackupTime";
const DATASTORE_INVITE_CACHE_KEY = "ProfileBackup_inviteCache";
const DATASTORE_PRIORITY_GUILDS_KEY = "ProfileBackup_priorityGuildIds";
const DATASTORE_BEST_FRIENDS_KEY = "ProfileBackup_bestFriendIds";
const LOG_PREFIX = "[ProfileBackup]";
const URL_RE = /^https?:\/\//i;

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

function dedupeUrls(urls: string[]): string[] {
    return Array.from(new Set(urls.filter(url => typeof url === "string" && URL_RE.test(url))));
}

function extractFavoriteGifUrls(input: unknown): string[] {
    if (!input) return [];

    if (typeof input === "string") {
        return URL_RE.test(input) ? [input] : [];
    }

    if (Array.isArray(input)) {
        const urls = input.flatMap(item => {
            if (typeof item === "string") return extractFavoriteGifUrls(item);
            if (!item || typeof item !== "object") return [];
            const anyItem = item as Record<string, any>;
            return extractFavoriteGifUrls(anyItem.url ?? anyItem.src ?? anyItem.gifUrl ?? anyItem.mediaUrl);
        });
        return dedupeUrls(urls);
    }

    if (input instanceof Map) {
        const urls: string[] = [];
        for (const [key, value] of input.entries()) {
            urls.push(...extractFavoriteGifUrls(key));
            urls.push(...extractFavoriteGifUrls(value));
        }
        return dedupeUrls(urls);
    }

    if (typeof input === "object") {
        const obj = input as Record<string, any>;

        if (obj.gifs) return extractFavoriteGifUrls(obj.gifs);

        const entries = Object.entries(obj);
        const hasUrlKeys = entries.length > 0 && entries.every(([key]) => URL_RE.test(key));

        if (hasUrlKeys) {
            return entries
                .sort(([, a], [, b]) => ((a as any)?.order ?? 0) - ((b as any)?.order ?? 0))
                .map(([url]) => url);
        }

        const urls: string[] = [];
        for (const [, value] of entries) {
            urls.push(...extractFavoriteGifUrls(value));
        }
        return dedupeUrls(urls);
    }

    return [];
}

function tryGetFromFrecencyProtoModule(): string[] {
    const candidate = (ProtoSettingsModule as any)?.default ?? ProtoSettingsModule;
    const typeName = candidate?.ProtoClass?.typeName;
    if (!typeName || !typeName.endsWith(".FrecencyUserSettings")) return [];

    const currentValue = candidate?.getCurrentValue?.();
    return extractFavoriteGifUrls(currentValue?.favoriteGifs?.gifs ?? currentValue?.favoriteGifs);
}

async function getFavoriteGifs(): Promise<string[]> {
    // Method 1: Frecency proto module
    try {
        console.log(`${LOG_PREFIX} Attempting favorite GIF fetch via FrecencyUserSettings proto module`);
        const gifs = dedupeUrls(tryGetFromFrecencyProtoModule());
        if (gifs.length > 0) {
            console.log(`${LOG_PREFIX} Loaded ${gifs.length} favorite GIF(s) from FrecencyUserSettings proto module`);
            return gifs;
        }
        console.log(`${LOG_PREFIX} FrecencyUserSettings proto module returned no favorite GIFs`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} FrecencyUserSettings proto module favorite GIF fetch failed`, e);
    }

    // Method 2: UserSettingsProtoStore variants
    try {
        console.log(`${LOG_PREFIX} Attempting favorite GIF fetch via UserSettingsProtoStore variants`);
        const candidates = [
            UserSettingsProtoStore?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs,
            UserSettingsProtoStore?.frecencyWithoutFetchingLatest?.favoriteGifs,
            UserSettingsProtoStore?.settings?.frecency?.favoriteGifs?.gifs,
            UserSettingsProtoStore?.settings?.frecency?.favoriteGifs,
            UserSettingsProtoStore?.getState?.()?.settings?.frecency?.favoriteGifs?.gifs,
            UserSettingsProtoStore?.getState?.()?.settings?.frecency?.favoriteGifs,
            UserSettingsProtoStore?.getCurrentValue?.()?.favoriteGifs?.gifs,
            UserSettingsProtoStore?.getCurrentValue?.()?.favoriteGifs,
        ];
        for (const [index, candidate] of candidates.entries()) {
            const gifs = dedupeUrls(extractFavoriteGifUrls(candidate));
            if (gifs.length > 0) {
                console.log(`${LOG_PREFIX} Loaded ${gifs.length} favorite GIF(s) from UserSettingsProtoStore variant #${index + 1}`);
                return gifs;
            }
        }
        console.log(`${LOG_PREFIX} UserSettingsProtoStore variants returned no favorite GIFs`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} UserSettingsProtoStore variants favorite GIF fetch failed`, e);
    }

    // Method 3: Proto REST endpoint
    try {
        console.log(`${LOG_PREFIX} Attempting favorite GIF fetch via /users/@me/settings-proto/2`);
        const resp = await RestAPI.get({ url: "/users/@me/settings-proto/2" });
        if (resp.body) {
            const gifs = dedupeUrls(
                extractFavoriteGifUrls(
                    resp.body?.favoriteGifs?.gifs
                    ?? resp.body?.favoriteGifs
                    ?? resp.body?.settings?.frecency?.favoriteGifs?.gifs
                    ?? resp.body?.settings?.frecency?.favoriteGifs
                    ?? resp.body
                )
            );
            if (gifs.length > 0) {
                console.log(`${LOG_PREFIX} Loaded ${gifs.length} favorite GIF(s) from settings-proto endpoint`);
                return gifs;
            }
        }
        console.log(`${LOG_PREFIX} settings-proto endpoint returned no favorite GIFs`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} settings-proto favorite GIF fetch failed`, e);
    }

    // Method 4: Legacy settings endpoint
    try {
        console.log(`${LOG_PREFIX} Attempting favorite GIF fetch via /users/@me/settings`);
        const resp = await RestAPI.get({ url: "/users/@me/settings" });
        const gifs = dedupeUrls(extractFavoriteGifUrls(resp.body?.frecency?.favoriteGifs ?? resp.body));
        if (gifs.length > 0) {
            console.log(`${LOG_PREFIX} Loaded ${gifs.length} favorite GIF(s) from legacy settings endpoint`);
            return gifs;
        }
        console.log(`${LOG_PREFIX} Legacy settings endpoint returned no favorite GIFs`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} Legacy settings favorite GIF fetch failed`, e);
    }

    // Method 5: LocalStorage fallback
    try {
        console.log(`${LOG_PREFIX} Attempting favorite GIF fetch via localStorage GIFFavouriteStore`);
        const raw = localStorage.getItem("GIFFavouriteStore");
        if (raw) {
            let gifs = dedupeUrls(extractFavoriteGifUrls(raw));
            if (gifs.length === 0) {
                try {
                    gifs = dedupeUrls(extractFavoriteGifUrls(JSON.parse(raw)));
                } catch { }
            }
            if (gifs.length > 0) {
                console.log(`${LOG_PREFIX} Loaded ${gifs.length} favorite GIF(s) from localStorage GIFFavouriteStore`);
                return gifs;
            }
        }
        console.log(`${LOG_PREFIX} localStorage GIFFavouriteStore returned no favorite GIFs`);
    } catch (e) {
        console.warn(`${LOG_PREFIX} localStorage GIFFavouriteStore favorite GIF fetch failed`, e);
    }

    console.warn(`${LOG_PREFIX} Could not load favorite GIFs from any method; backing up 0 GIFs`);
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

function pruneInviteCache(cache: Record<string, string>, activeGuildIds: Set<string>): Record<string, string> {
    const pruned: Record<string, string> = {};
    for (const [guildId, inviteCode] of Object.entries(cache)) {
        if (activeGuildIds.has(guildId)) {
            pruned[guildId] = inviteCode;
        }
    }
    return pruned;
}

function normalizeIdArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.filter((id): id is string => typeof id === "string" && id.length > 0)));
}

export async function getPriorityGuildIds(): Promise<string[]> {
    return normalizeIdArray(await DataStore.get(DATASTORE_PRIORITY_GUILDS_KEY));
}

export async function setPriorityGuildIds(ids: string[]): Promise<void> {
    await DataStore.set(DATASTORE_PRIORITY_GUILDS_KEY, normalizeIdArray(ids));
}

export async function togglePriorityGuildId(guildId: string): Promise<boolean> {
    const current = new Set(await getPriorityGuildIds());
    if (current.has(guildId)) {
        current.delete(guildId);
        await setPriorityGuildIds(Array.from(current));
        return false;
    }
    current.add(guildId);
    await setPriorityGuildIds(Array.from(current));
    return true;
}

export async function getBestFriendIds(): Promise<string[]> {
    return normalizeIdArray(await DataStore.get(DATASTORE_BEST_FRIENDS_KEY));
}

export async function setBestFriendIds(ids: string[]): Promise<void> {
    await DataStore.set(DATASTORE_BEST_FRIENDS_KEY, normalizeIdArray(ids));
}

export async function toggleBestFriendId(userId: string): Promise<boolean> {
    const current = new Set(await getBestFriendIds());
    if (current.has(userId)) {
        current.delete(userId);
        await setBestFriendIds(Array.from(current));
        return false;
    }
    current.add(userId);
    await setBestFriendIds(Array.from(current));
    return true;
}

async function getGuildInvite(guildId: string, cache: Record<string, string>): Promise<string | null> {
    // Use cached invite if we already have one for this guild ID
    if (cache[guildId]) return cache[guildId];

    try {
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
    console.log(`${LOG_PREFIX} Backup collection found ${favoriteGifs.length} favorite GIF(s)`);

    onProgress?.("Collecting friends list...");
    const friends = getFriends();
    const friendIds = new Set(friends.map(friend => friend.id));

    onProgress?.("Syncing best friend tags...");
    const bestFriendIds = (await getBestFriendIds()).filter(id => friendIds.has(id));
    await setBestFriendIds(bestFriendIds);

    onProgress?.("Collecting server list and creating invites...");
    const guilds: ProfileBackup["guilds"] = [];
    const allGuilds = Object.values(GuildStore.getGuilds()) as any[];
    const activeGuildIds = new Set(allGuilds.map((guild: any) => guild.id));

    onProgress?.("Syncing priority server tags...");
    const priorityGuildIds = (await getPriorityGuildIds()).filter(id => activeGuildIds.has(id));
    await setPriorityGuildIds(priorityGuildIds);

    // Load cached invites so we don't recreate them every backup
    let inviteCache = await getInviteCache();
    inviteCache = pruneInviteCache(inviteCache, activeGuildIds);
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
        priorityGuildIds,
        bestFriendIds,
        friends,
        guilds,
    };

    return backup;
}

export async function saveBackupToDataStore(backup: ProfileBackup): Promise<void> {
    console.log(`${LOG_PREFIX} Saving backup to DataStore (favorite GIFs: ${backup.favoriteGifs.length})`);
    await DataStore.set(DATASTORE_KEY, backup);
    await DataStore.set(DATASTORE_TIMESTAMP_KEY, Date.now());
    console.log(`${LOG_PREFIX} Backup saved to DataStore successfully`);
}

export async function loadBackupFromDataStore(): Promise<ProfileBackup | null> {
    const backup = await DataStore.get(DATASTORE_KEY) ?? null;
    console.log(
        `${LOG_PREFIX} Loaded backup from DataStore: ${backup ? `found (favorite GIFs: ${backup.favoriteGifs.length})` : "not found"}`
    );
    return backup;
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
