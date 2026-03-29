export interface ProfileBackup {
    version: number;
    exportedAt: string;
    sourceUser: {
        id: string;
        username: string;
    };
    profile: {
        bio: string;
        pronouns: string;
        avatar: string | null;
        banner: string | null;
        accentColor: number | null;
    };
    customStatus: {
        text: string;
        emojiName: string | null;
        expiresAt: string | null;
    } | null;
    favoriteGifs: string[];
    priorityGuildIds: string[];
    bestFriendIds: string[];
    friends: Array<{
        id: string;
        username: string;
        displayName: string;
    }>;
    guilds: Array<{
        id: string;
        name: string;
        inviteCode: string | null;
        iconUrl: string | null;
    }>;
}

export const BACKUP_VERSION = 2;

export interface DiscordServerRestoreResult {
    success: boolean;
    guildId?: string;
    inviteCode?: string;
    error?: string;
}

export interface RestoreResult {
    profile: { success: boolean; error?: string; };
    customStatus: { success: boolean; error?: string; };
    favoriteGifs: { success: boolean; error?: string; };
}

export interface RestoreOptions {
    profile: boolean;
    customStatus: boolean;
    favoriteGifs: boolean;
}
