import { definePluginSettings } from "@api/Settings";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, React, showToast, Toasts } from "@webpack/common";

import {
    collectBackup,
    saveBackupToDataStore,
    saveBackupToDocumentsFolder,
    getLastBackupTime,
    togglePriorityGuildId,
    toggleBestFriendId,
} from "./backup";
import BackupPanel from "./components/BackupPanel";

const INTERVAL_MS: Record<string, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

const GuildContextPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: { id: string; name?: string; }; }) => {
    if (!guild?.id) return;

    children.push(
        React.createElement(Menu.MenuItem, {
            id: "profilebackup-priority-server",
            label: "Priority Server",
            action: async () => {
                const enabled = await togglePriorityGuildId(guild.id);
                showToast(
                    `${enabled ? "Marked" : "Unmarked"} ${guild.name ?? "server"} as Priority Server`,
                    Toasts.Type.MESSAGE
                );
            }
        })
    );
};

const UserContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; username?: string; globalName?: string; }; }) => {
    if (!user?.id) return;

    children.push(
        React.createElement(Menu.MenuItem, {
            id: "profilebackup-best-friend",
            label: "Best Friend",
            action: async () => {
                const enabled = await toggleBestFriendId(user.id);
                const name = user.globalName ?? user.username ?? "user";
                showToast(
                    `${enabled ? "Marked" : "Unmarked"} ${name} as Best Friend`,
                    Toasts.Type.MESSAGE
                );
            }
        })
    );
};

async function runAutoBackup() {
    try {
        const backup = await collectBackup();
        await saveBackupToDataStore(backup);
        try {
            const savedPath = await saveBackupToDocumentsFolder(backup);
            console.log("[ProfileBackup] Auto-backup also saved to", savedPath);
        } catch (e) {
            console.warn("[ProfileBackup] Auto-backup saved to DataStore only (Documents save failed):", e);
        }
        console.log("[ProfileBackup] Auto-backup completed at", new Date().toISOString());
    } catch (e) {
        console.error("[ProfileBackup] Auto-backup failed:", e);
    }
}

async function scheduleAutoBackup(interval: string) {
    if (autoBackupTimer) clearInterval(autoBackupTimer);

    const ms = INTERVAL_MS[interval] ?? INTERVAL_MS.daily;

    const lastBackup = await getLastBackupTime();
    if (!lastBackup || Date.now() - lastBackup > ms) {
        setTimeout(runAutoBackup, 30_000);
    }

    autoBackupTimer = setInterval(runAutoBackup, ms);
}

const settings = definePluginSettings({
    autoBackupInterval: {
        type: OptionType.SELECT,
        description: "How often to automatically backup your profile",
        options: [
            { label: "Hourly", value: "hourly" },
            { label: "Daily", value: "daily", default: true },
            { label: "Weekly", value: "weekly" },
        ],
    },
});

export default definePlugin({
    name: "ProfileBackup",
    description: "Auto-backs up your profile data (bio, avatar, GIFs, friends, servers) and lets you restore it on a new account.",
    authors: [{ name: "DiscordTermProt", id: 0n }],

    settings,

    settingsAboutComponent: BackupPanel,

    contextMenus: {
        "guild-context": GuildContextPatch,
        "guild-header-popout": GuildContextPatch,
        "user-context": UserContextPatch
    },

    start() {
        const interval = settings.store.autoBackupInterval ?? "daily";
        scheduleAutoBackup(interval);
    },

    stop() {
        if (autoBackupTimer) {
            clearInterval(autoBackupTimer);
            autoBackupTimer = null;
        }
    },
});
