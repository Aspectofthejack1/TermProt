import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import { collectBackup, saveBackupToDataStore, getLastBackupTime } from "./backup";
import BackupPanel from "./components/BackupPanel";

const INTERVAL_MS: Record<string, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

async function runAutoBackup() {
    try {
        const backup = await collectBackup();
        await saveBackupToDataStore(backup);
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
