import { RestAPI } from "@webpack/common";
import { filters, findAll, findStoreLazy } from "@webpack";

import { BACKUP_VERSION, ProfileBackup, RestoreOptions, RestoreResult, DiscordServerRestoreResult } from "./types";

const LOG_PREFIX = "[ProfileBackup]";
const URL_RE = /^https?:\/\//i;
const UserSettingsProtoStore = findStoreLazy("UserSettingsProtoStore");

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

    if (typeof input === "object") {
        const obj = input as Record<string, any>;
        if (obj.gifs) return extractFavoriteGifUrls(obj.gifs);

        const entries = Object.entries(obj);
        const hasUrlKeys = entries.length > 0 && entries.every(([key]) => URL_RE.test(key));
        if (hasUrlKeys) return entries.map(([url]) => url);

        const urls: string[] = [];
        for (const [, value] of entries) urls.push(...extractFavoriteGifUrls(value));
        return dedupeUrls(urls);
    }

    return [];
}

function buildFavoriteGifEntries(urls: string[]): Record<string, any> {
    const now = Date.now();
    const entries: Record<string, any> = {};
    urls.forEach((url, i) => {
        entries[url] = {
            totalUses: 1,
            recentUses: [now - i * 1000],
            frecency: Math.max(1, 100 - i),
            score: Math.max(1, 100 - i),
            order: i,
        };
    });
    return entries;
}

async function readCurrentFavoriteGifs(): Promise<string[]> {
    // Readback from both known endpoints and merge results.
    const all: string[] = [];

    try {
        all.push(
            ...extractFavoriteGifUrls(
                UserSettingsProtoStore?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs
                ?? UserSettingsProtoStore?.frecencyWithoutFetchingLatest?.favoriteGifs
                ?? UserSettingsProtoStore?.settings?.frecency?.favoriteGifs?.gifs
                ?? UserSettingsProtoStore?.settings?.frecency?.favoriteGifs
                ?? UserSettingsProtoStore?.getState?.()?.settings?.frecency?.favoriteGifs?.gifs
                ?? UserSettingsProtoStore?.getState?.()?.settings?.frecency?.favoriteGifs
                ?? UserSettingsProtoStore?.getCurrentValue?.()?.favoriteGifs?.gifs
                ?? UserSettingsProtoStore?.getCurrentValue?.()?.favoriteGifs
            )
        );
    } catch (e) {
        console.warn(`${LOG_PREFIX} Could not read favorite GIFs from UserSettingsProtoStore`, e);
    }

    try {
        const resp = await RestAPI.get({ url: "/users/@me/settings" });
        all.push(...extractFavoriteGifUrls(resp.body?.frecency?.favoriteGifs));
    } catch (e) {
        console.warn(`${LOG_PREFIX} Could not read favorite GIFs from /users/@me/settings`, e);
    }

    try {
        const resp = await RestAPI.get({ url: "/users/@me/settings-proto/2" });
        all.push(
            ...extractFavoriteGifUrls(
                resp.body?.favoriteGifs?.gifs
                ?? resp.body?.favoriteGifs
                ?? resp.body?.settings?.frecency?.favoriteGifs
            )
        );
    } catch (e) {
        console.warn(`${LOG_PREFIX} Could not read favorite GIFs from /users/@me/settings-proto/2`, e);
    }

    return dedupeUrls(all);
}

type FavoriteGifAction = (input: any) => unknown;

function getFavoriteGifActionCandidates(): FavoriteGifAction[] {
    try {
        const matches = findAll(filters.byCode("favoriteGifs"));
        const actions = matches.filter((m): m is FavoriteGifAction => typeof m === "function");
        console.log(`${LOG_PREFIX} Found ${actions.length} favorite GIF action candidate(s)`);
        return actions;
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to locate favorite GIF action candidates`, e);
        return [];
    }
}

function prioritizeFavoriteActions(actions: FavoriteGifAction[]): FavoriteGifAction[] {
    const scored = actions.map(action => {
        const source = action.toString();
        let score = 0;
        if (source.includes("updateAsync")) score += 5;
        if (source.includes("favoriteGifs")) score += 4;
        if (source.includes(".url")) score += 3;
        if (source.includes("src")) score += 2;
        if (source.includes("order")) score += 2;
        if (source.includes("[") && source.includes("gifs")) score += 2;
        if (source.includes("delete")) score -= 5;
        return { action, score };
    });
    return scored.sort((a, b) => b.score - a.score).map(s => s.action);
}

async function tryRestoreViaInternalActions(urls: string[]): Promise<{ success: boolean; matched: number; error?: string; }> {
    const candidates = prioritizeFavoriteActions(getFavoriteGifActionCandidates());
    if (candidates.length === 0) {
        return { success: false, matched: 0, error: "No favorite GIF action candidates found" };
    }

    const probeUrl = urls[0];
    let selectedAction: FavoriteGifAction | null = null;

    for (const candidate of candidates) {
        try {
            await Promise.resolve(candidate({
                format: 2,
                url: probeUrl,
                src: probeUrl,
                order: 0,
                width: 1,
                height: 1,
            }));
            await sleep(250);
            const readback = await readCurrentFavoriteGifs();
            if (readback.includes(probeUrl)) {
                selectedAction = candidate;
                console.log(`${LOG_PREFIX} Selected favorite GIF internal action candidate`);
                break;
            }
        } catch {
            // Try next candidate.
        }
    }

    if (!selectedAction) {
        return { success: false, matched: 0, error: "Could not find a working internal favorite GIF action" };
    }

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            await Promise.resolve(selectedAction({
                format: 2,
                url,
                src: url,
                order: i,
                width: 1,
                height: 1,
            }));
        } catch (e) {
            console.warn(`${LOG_PREFIX} Failed to favorite GIF via internal action`, e);
        }
        if (i > 0 && i % 40 === 0) {
            await sleep(50);
        }
    }

    await sleep(500);
    const readback = await readCurrentFavoriteGifs();
    const readbackSet = new Set(readback);
    const matched = urls.filter(url => readbackSet.has(url)).length;
    return { success: matched > 0, matched };
}

function writeLocalGifFavoriteStore(urls: string[]): number {
    try {
        const now = Date.now();
        const payload = urls.map((url, index) => ({
            format: 2,
            url,
            src: url,
            order: index,
            width: 1,
            height: 1,
            createdAt: now - index,
        }));
        localStorage.setItem("GIFFavouriteStore", JSON.stringify(payload));
        console.log(`${LOG_PREFIX} Wrote ${payload.length} GIF(s) to localStorage GIFFavouriteStore fallback`);
        return payload.length;
    } catch (e) {
        console.warn(`${LOG_PREFIX} Failed to write localStorage GIFFavouriteStore fallback`, e);
        return 0;
    }
}

export function parseBackupFile(jsonString: string): ProfileBackup {
    const data = JSON.parse(jsonString);
    if (!data.version || data.version > BACKUP_VERSION) {
        throw new Error(`Unsupported backup version: ${data.version}. Expected ${BACKUP_VERSION} or lower.`);
    }
    if (!data.sourceUser || !data.profile) {
        throw new Error("Invalid backup file: missing required fields.");
    }
    return data as ProfileBackup;
}

async function restoreProfile(backup: ProfileBackup): Promise<{ success: boolean; error?: string; }> {
    try {
        const body: Record<string, any> = {
            bio: backup.profile.bio,
            pronouns: backup.profile.pronouns,
            accent_color: backup.profile.accentColor,
        };

        if (backup.profile.avatar) {
            body.avatar = backup.profile.avatar;
        }
        if (backup.profile.banner) {
            body.banner = backup.profile.banner;
        }

        await RestAPI.patch({
            url: "/users/@me",
            body,
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Failed to update profile" };
    }
}

async function restoreCustomStatus(backup: ProfileBackup): Promise<{ success: boolean; error?: string; }> {
    if (!backup.customStatus) return { success: true };

    try {
        await RestAPI.patch({
            url: "/users/@me/settings",
            body: {
                custom_status: {
                    text: backup.customStatus.text,
                    emoji_name: backup.customStatus.emojiName,
                    expires_at: backup.customStatus.expiresAt,
                },
            },
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message ?? "Failed to set custom status" };
    }
}

async function restoreFavoriteGifs(backup: ProfileBackup): Promise<{ success: boolean; error?: string; }> {
    const urls = dedupeUrls(backup.favoriteGifs);
    if (urls.length === 0) {
        console.log(`${LOG_PREFIX} Restore favorite GIFs skipped: backup contains 0 GIFs`);
        return { success: true };
    }

    const favoriteGifEntries = buildFavoriteGifEntries(urls);
    const attempts: Array<{ label: string; url: string; body: Record<string, any>; }> = [
        {
            label: "legacy settings nested frecency.favoriteGifs.gifs",
            url: "/users/@me/settings",
            body: { frecency: { favoriteGifs: { gifs: favoriteGifEntries } } },
        },
        {
            label: "legacy settings frecency.favoriteGifs",
            url: "/users/@me/settings",
            body: { frecency: { favoriteGifs: favoriteGifEntries } },
        },
        {
            label: "settings-proto favoriteGifs.gifs",
            url: "/users/@me/settings-proto/2",
            body: { favoriteGifs: { gifs: favoriteGifEntries } },
        },
    ];

    const errors: string[] = [];

    try {
        console.log(`${LOG_PREFIX} Restoring ${urls.length} favorite GIF(s)`);

        // Primary strategy: use Discord's internal favorite GIF action, which updates
        // the user settings model in the same way the GIF picker does.
        const actionRestore = await tryRestoreViaInternalActions(urls);
        if (actionRestore.success) {
            console.log(`${LOG_PREFIX} Favorite GIF internal action restore matched ${actionRestore.matched}/${urls.length}`);
            return { success: true };
        }
        if (actionRestore.error) {
            errors.push(`internal action: ${actionRestore.error}`);
        }

        // Fallback strategy: attempt direct REST settings patches.
        for (const attempt of attempts) {
            try {
                console.log(`${LOG_PREFIX} Attempting GIF restore via ${attempt.label}`);
                await RestAPI.patch({
                    url: attempt.url,
                    body: attempt.body,
                });

                // Give Discord a moment to apply updated settings before readback.
                await sleep(500);
                const readback = await readCurrentFavoriteGifs();
                const readbackSet = new Set(readback);
                const matched = urls.filter(url => readbackSet.has(url)).length;
                console.log(
                    `${LOG_PREFIX} GIF restore readback after ${attempt.label}: ${readback.length} total, ${matched}/${urls.length} matched`
                );
                if (matched > 0) {
                    return { success: true };
                }

                errors.push(`${attempt.label}: no restored GIFs found in readback`);
            } catch (e: any) {
                const msg = e?.body?.message ?? e?.message ?? "Unknown error";
                console.warn(`${LOG_PREFIX} GIF restore attempt failed via ${attempt.label}`, e);
                errors.push(`${attempt.label}: ${msg}`);
            }
        }

        const localWritten = writeLocalGifFavoriteStore(urls);
        if (localWritten > 0) {
            return { success: true };
        }

        return {
            success: false,
            error: `Restore request sent but favorites did not apply. Attempts: ${errors.join(" | ")}`,
        };
    } catch (e: any) {
        console.error(`${LOG_PREFIX} Favorite GIF restore failed`, e);
        return { success: false, error: e?.message ?? "Failed to restore GIF favorites" };
    }
}

async function restoreFriends(
    backup: ProfileBackup,
    onProgress?: (status: string) => void
): Promise<{ sent: number; failed: number; errors: string[]; }> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const friend of backup.friends) {
        onProgress?.(`Sending friend request to ${friend.username}...`);
        try {
            await RestAPI.post({
                url: "/users/@me/relationships",
                body: {
                    username: friend.username,
                    discriminator: 0,
                },
            });
            sent++;
        } catch (e: any) {
            failed++;
            const msg = e?.body?.message ?? e?.message ?? "Unknown error";
            errors.push(`${friend.username}: ${msg}`);
        }
        // Rate limit delay
        await sleep(3000);
    }

    return { sent, failed, errors };
}

async function restoreGuilds(
    backup: ProfileBackup,
    onProgress?: (status: string) => void
): Promise<{ joined: number; failed: number; errors: string[]; }> {
    let joined = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const guild of backup.guilds) {
        if (!guild.inviteCode) {
            failed++;
            errors.push(`${guild.name}: No invite link available — rejoin manually`);
            continue;
        }

        onProgress?.(`Joining server: ${guild.name}...`);
        try {
            await RestAPI.post({
                url: `/invites/${guild.inviteCode}`,
            });
            joined++;
        } catch (e: any) {
            failed++;
            const msg = e?.body?.message ?? e?.message ?? "Unknown error";
            errors.push(`${guild.name}: ${msg}`);
        }
        await sleep(1500);
    }

    return { joined, failed, errors };
}

const DISCORD_MSG_CHAR_LIMIT = 2000;

function chunkLines(lines: string[], maxContentLen: number, separator: string): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const line of lines) {
        const addLen = line.length + (current.length > 0 ? separator.length : 0);
        if (currentLen + addLen > maxContentLen && current.length > 0) {
            chunks.push(current);
            current = [line];
            currentLen = line.length;
        } else {
            current.push(line);
            currentLen += addLen;
        }
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

function buildPagedMessages(title: string, lines: string[], separator = "\n"): string[] {
    // Reserve chars for "**Title — Page XX/XX**\n"
    const headerReserve = title.length + 25;
    const contentLimit = DISCORD_MSG_CHAR_LIMIT - headerReserve;
    const chunks = chunkLines(lines, contentLimit, separator);
    return chunks.map((chunk, i) =>
        `**${title} — ${i + 1}/${chunks.length}**\n${chunk.join(separator)}`
    );
}

export async function restoreViaDiscordServer(
    backup: ProfileBackup,
    onProgress?: (status: string) => void
): Promise<DiscordServerRestoreResult> {
    try {
        onProgress?.("Creating restore server...");
        const createResp = await RestAPI.post({
            url: "/guilds",
            body: {
                name: `Restore — ${backup.sourceUser.username}`,
                channels: [
                    { id: "100", type: 0, name: "servers" },
                    { id: "101", type: 0, name: "friends" },
                ],
            },
        });

        if (!createResp.body?.id) {
            return { success: false, error: "Failed to create guild — no ID returned." };
        }

        const guildId: string = createResp.body.id;
        onProgress?.("Server created, fetching channels...");
        await sleep(1500);

        const channelsResp = await RestAPI.get({ url: `/guilds/${guildId}/channels` });
        const allChannels: any[] = channelsResp.body ?? [];
        const textChannels = allChannels.filter((c: any) => c.type === 0);

        const serversChannel = textChannels.find((c: any) => c.name === "servers") ?? textChannels[0];
        const friendsChannel = textChannels.find((c: any) => c.name === "friends") ?? serversChannel;

        if (!serversChannel) {
            return { success: false, guildId, error: "No text channel found in the new guild." };
        }

        // Create a permanent invite so the user can switch to the new account and join
        let inviteCode: string | undefined;
        try {
            const invResp = await RestAPI.post({
                url: `/channels/${serversChannel.id}/invites`,
                body: { max_age: 0, max_uses: 0, temporary: false },
            });
            inviteCode = invResp.body?.code;
        } catch { /* invite is optional */ }

        // Post sorted server invites
        if (backup.guilds.length > 0) {
            onProgress?.(`Posting ${backup.guilds.length} server invite(s)...`);
            const sorted = [...backup.guilds].sort((a, b) => a.name.localeCompare(b.name));
            const lines = sorted.map(g =>
                g.inviteCode
                    ? `• **${g.name}** — discord.gg/${g.inviteCode}`
                    : `• **${g.name}** — *(no invite available)*`
            );
            const messages = buildPagedMessages("Servers (A → Z)", lines);
            for (const msg of messages) {
                await RestAPI.post({
                    url: `/channels/${serversChannel.id}/messages`,
                    body: { content: msg },
                });
                await sleep(600);
            }
        }

        // Post friend mentions sorted by display name
        if (backup.friends.length > 0) {
            onProgress?.(`Posting ${backup.friends.length} friend mention(s)...`);
            const sorted = [...backup.friends].sort((a, b) =>
                a.displayName.localeCompare(b.displayName)
            );
            const lines = sorted.map(f => `• **${f.displayName}** — <@${f.id}>`);
            const messages = buildPagedMessages("Friends (A → Z)", lines);
            for (const msg of messages) {
                await RestAPI.post({
                    url: `/channels/${friendsChannel.id}/messages`,
                    body: { content: msg, allowed_mentions: { parse: [] } },
                });
                await sleep(600);
            }
        }

        onProgress?.("Restore server is ready!");
        return { success: true, guildId, inviteCode };
    } catch (e: any) {
        return { success: false, error: e?.body?.message ?? e?.message ?? "Unknown error" };
    }
}

export async function restoreFromBackup(
    backup: ProfileBackup,
    options: RestoreOptions,
    onProgress?: (status: string) => void
): Promise<RestoreResult> {
    const result: RestoreResult = {
        profile: { success: true },
        customStatus: { success: true },
        favoriteGifs: { success: true },
        friends: { sent: 0, failed: 0, errors: [] },
        guilds: { joined: 0, failed: 0, errors: [] },
    };

    if (options.profile) {
        onProgress?.("Restoring profile...");
        result.profile = await restoreProfile(backup);
    }

    if (options.customStatus) {
        onProgress?.("Restoring custom status...");
        result.customStatus = await restoreCustomStatus(backup);
    }

    if (options.favoriteGifs) {
        onProgress?.("Restoring favorite GIFs...");
        result.favoriteGifs = await restoreFavoriteGifs(backup);
    }

    if (options.friends) {
        onProgress?.("Sending friend requests...");
        result.friends = await restoreFriends(backup, onProgress);
    }

    if (options.guilds) {
        onProgress?.("Joining servers...");
        result.guilds = await restoreGuilds(backup, onProgress);
    }

    onProgress?.("Restore complete!");
    return result;
}
