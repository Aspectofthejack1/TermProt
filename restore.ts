import { RestAPI } from "@webpack/common";

import { BACKUP_VERSION, ProfileBackup, RestoreOptions, RestoreResult } from "./types";

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    if (backup.favoriteGifs.length === 0) return { success: true };

    try {
        // Rebuild the frecency object preserving order from backup
        const now = Date.now();
        const favoriteGifs: Record<string, any> = {};
        backup.favoriteGifs.forEach((url, i) => {
            favoriteGifs[url] = {
                totalUses: 1,
                recentUses: [now - i * 1000],
                frecency: 100 - i,
                score: 100 - i,
                order: i,
            };
        });

        await RestAPI.patch({
            url: "/users/@me/settings",
            body: {
                frecency: { favoriteGifs },
            },
        });
        return { success: true };
    } catch (e: any) {
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
