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

export const BACKUP_VERSION = 1;

export interface RestoreResult {
    profile: { success: boolean; error?: string; };
    customStatus: { success: boolean; error?: string; };
    favoriteGifs: { success: boolean; error?: string; };
    friends: {
        sent: number;
        failed: number;
        errors: string[];
    };
    guilds: {
        joined: number;
        failed: number;
        errors: string[];
    };
}

export interface RestoreOptions {
    profile: boolean;
    customStatus: boolean;
    favoriteGifs: boolean;
    friends: boolean;
    guilds: boolean;
}
