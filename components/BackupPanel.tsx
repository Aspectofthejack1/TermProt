import { Forms, Button, useState, useEffect, useCallback } from "@webpack/common";

import { collectBackup, saveBackupToDataStore, loadBackupFromDataStore, getLastBackupTime, downloadBackupAsFile } from "../backup";
import { parseBackupFile, restoreFromBackup, restoreViaDiscordServer } from "../restore";
import { ProfileBackup, RestoreOptions, RestoreResult, DiscordServerRestoreResult } from "../types";

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function CheckboxRow({ label, note, checked, onChange, disabled }: {
    label: string;
    note: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", opacity: disabled ? 0.5 : 1 }}>
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                style={{ width: 18, height: 18, cursor: disabled ? "default" : "pointer" }}
            />
            <div>
                <div style={{ fontWeight: 500, color: "var(--header-primary)" }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{note}</div>
            </div>
        </div>
    );
}

function BackupSection() {
    const [status, setStatus] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [lastBackup, setLastBackup] = useState<number | null>(null);

    useEffect(() => {
        getLastBackupTime().then(setLastBackup);
    }, []);

    const handleBackupNow = useCallback(async () => {
        setIsRunning(true);
        setStatus("Starting backup...");
        try {
            const backup = await collectBackup(setStatus);
            await saveBackupToDataStore(backup);
            const now = Date.now();
            setLastBackup(now);
            setStatus("Backup saved to local storage!");
        } catch (e: any) {
            setStatus(`Backup failed: ${e.message}`);
        }
        setIsRunning(false);
    }, []);

    const handleExportFile = useCallback(async () => {
        setIsRunning(true);
        setStatus("Preparing export...");
        try {
            let backup = await loadBackupFromDataStore();
            if (!backup) {
                setStatus("No saved backup found. Creating one first...");
                backup = await collectBackup(setStatus);
                await saveBackupToDataStore(backup);
                setLastBackup(Date.now());
            }
            downloadBackupAsFile(backup);
            setStatus("File downloaded!");
        } catch (e: any) {
            setStatus(`Export failed: ${e.message}`);
        }
        setIsRunning(false);
    }, []);

    return (
        <div style={{ marginBottom: 24 }}>
            <Forms.FormTitle tag="h3">Backup</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 12 }}>
                {lastBackup
                    ? `Last backup: ${formatTimeAgo(lastBackup)}`
                    : "No backup yet. Create one to protect your profile data."}
            </Forms.FormText>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Button
                    onClick={handleBackupNow}
                    disabled={isRunning}
                    size={Button.Sizes.SMALL}
                >
                    {isRunning ? "Working..." : "Backup Now"}
                </Button>
                <Button
                    onClick={handleExportFile}
                    disabled={isRunning}
                    size={Button.Sizes.SMALL}
                    look={Button.Looks.OUTLINED}
                >
                    Export to File
                </Button>
            </div>
            {status && (
                <Forms.FormText style={{ color: status.includes("failed") ? "var(--text-danger)" : "var(--text-muted)" }}>
                    {status}
                </Forms.FormText>
            )}
        </div>
    );
}

function RestorePreview({ backup, onRestore, onCreateServer, onCancel, isRunning }: {
    backup: ProfileBackup;
    onRestore: (options: RestoreOptions) => void;
    onCreateServer: () => void;
    onCancel: () => void;
    isRunning: boolean;
}) {
    const [options, setOptions] = useState<RestoreOptions>({
        profile: true,
        customStatus: true,
        favoriteGifs: true,
    });

    const toggle = (key: keyof RestoreOptions) =>
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <div style={{ padding: 12, background: "var(--background-secondary)", borderRadius: 8, marginBottom: 12 }}>
            <Forms.FormTitle tag="h4">Restore Preview</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: 8 }}>
                Backup from <strong>{backup.sourceUser.username}</strong> — {new Date(backup.exportedAt).toLocaleDateString()}
            </Forms.FormText>
            <Forms.FormText style={{ marginBottom: 8, color: "var(--text-muted)" }}>
                Tagged: {(backup.priorityGuildIds?.length ?? 0)} priority server(s), {(backup.bestFriendIds?.length ?? 0)} best friend(s)
            </Forms.FormText>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                <CheckboxRow
                    label="Profile Data"
                    note="Bio, pronouns, avatar, banner, accent color"
                    checked={options.profile}
                    onChange={() => toggle("profile")}
                />
                <CheckboxRow
                    label="Custom Status"
                    note={backup.customStatus ? `"${backup.customStatus.text}"` : "No custom status in backup"}
                    checked={options.customStatus}
                    onChange={() => toggle("customStatus")}
                    disabled={!backup.customStatus}
                />
                <CheckboxRow
                    label="Favorite GIFs"
                    note={`${backup.favoriteGifs.length} favorite GIF${backup.favoriteGifs.length !== 1 ? "s" : ""}`}
                    checked={options.favoriteGifs}
                    onChange={() => toggle("favoriteGifs")}
                />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={() => onRestore(options)} size={Button.Sizes.SMALL} color={Button.Colors.GREEN} disabled={isRunning}>
                    Apply Restore
                </Button>
                <Button onClick={onCreateServer} size={Button.Sizes.SMALL} color={Button.Colors.BRAND} disabled={isRunning}>
                    Create Restore Server
                </Button>
                <Button onClick={onCancel} size={Button.Sizes.SMALL} look={Button.Looks.OUTLINED} disabled={isRunning}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function DiscordServerResult({ result }: { result: DiscordServerRestoreResult; }) {
    return (
        <div style={{ padding: 12, background: "var(--background-secondary)", borderRadius: 8, marginBottom: 12 }}>
            <Forms.FormTitle tag="h4">Restore Server {result.success ? "Created" : "Failed"}</Forms.FormTitle>
            {result.success ? (
                <>
                    <Forms.FormText style={{ marginBottom: 6 }}>
                        Your restore server is ready. Join it on your new account to see 4 channels: priority-servers, best-friends, servers, and friends.
                    </Forms.FormText>
                    {result.inviteCode && (
                        <div style={{ padding: "6px 10px", background: "var(--background-tertiary)", borderRadius: 6, display: "inline-block" }}>
                            <span style={{ color: "var(--text-muted)", fontSize: 12, marginRight: 6 }}>Invite link:</span>
                            <strong>discord.gg/{result.inviteCode}</strong>
                        </div>
                    )}
                    {!result.inviteCode && (
                        <Forms.FormText style={{ color: "var(--text-muted)" }}>
                            No invite was created — open Discord and find the server manually.
                        </Forms.FormText>
                    )}
                </>
            ) : (
                <Forms.FormText style={{ color: "var(--text-danger)" }}>
                    {result.error ?? "An unknown error occurred."}
                </Forms.FormText>
            )}
        </div>
    );
}

function RestoreResults({ result }: { result: RestoreResult; }) {
    return (
        <div style={{ padding: 12, background: "var(--background-secondary)", borderRadius: 8, marginBottom: 12 }}>
            <Forms.FormTitle tag="h4">Restore Results</Forms.FormTitle>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li>{result.profile.success ? "Profile updated" : `Profile failed: ${result.profile.error}`}</li>
                <li>{result.customStatus.success ? "Custom status set" : `Custom status failed: ${result.customStatus.error}`}</li>
                <li>{result.favoriteGifs.success ? "GIF favorites restored" : `GIF favorites failed: ${result.favoriteGifs.error}`}</li>
            </ul>
        </div>
    );
}

function RestoreSection() {
    const [preview, setPreview] = useState<ProfileBackup | null>(null);
    const [result, setResult] = useState<RestoreResult | null>(null);
    const [serverResult, setServerResult] = useState<DiscordServerRestoreResult | null>(null);
    const [status, setStatus] = useState("");
    const [isRunning, setIsRunning] = useState(false);

    const handleFileUpload = useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const backup = parseBackupFile(text);
                setPreview(backup);
                setResult(null);
                setStatus("");
            } catch (e: any) {
                setStatus(`Invalid backup file: ${e.message}`);
            }
        };
        input.click();
    }, []);

    const handleRestoreFromDataStore = useCallback(async () => {
        try {
            const backup = await loadBackupFromDataStore();
            if (!backup) {
                setStatus("No auto-backup found in local storage.");
                return;
            }
            setPreview(backup);
            setResult(null);
            setStatus("");
        } catch (e: any) {
            setStatus(`Failed to load backup: ${e.message}`);
        }
    }, []);

    const handleRestore = useCallback(async (options: RestoreOptions) => {
        if (!preview) return;
        setIsRunning(true);
        setStatus("Restoring...");
        try {
            const res = await restoreFromBackup(preview, options, setStatus);
            setResult(res);
            setServerResult(null);
            setPreview(null);
            setStatus("");
        } catch (e: any) {
            setStatus(`Restore failed: ${e.message}`);
        }
        setIsRunning(false);
    }, [preview]);

    const handleCreateServer = useCallback(async () => {
        if (!preview) return;
        setIsRunning(true);
        setStatus("Building restore server...");
        try {
            const res = await restoreViaDiscordServer(preview, setStatus);
            setServerResult(res);
            setResult(null);
            setPreview(null);
            setStatus(res.success ? "" : `Failed: ${res.error}`);
        } catch (e: any) {
            setStatus(`Failed: ${e.message}`);
        }
        setIsRunning(false);
    }, [preview]);

    return (
        <div>
            <Forms.FormTitle tag="h3">Restore</Forms.FormTitle>
            {!preview && !result && !serverResult && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Button
                        onClick={handleFileUpload}
                        disabled={isRunning}
                        size={Button.Sizes.SMALL}
                    >
                        Restore from File
                    </Button>
                    <Button
                        onClick={handleRestoreFromDataStore}
                        disabled={isRunning}
                        size={Button.Sizes.SMALL}
                        look={Button.Looks.OUTLINED}
                    >
                        Restore from Last Auto-Backup
                    </Button>
                </div>
            )}
            {preview && (
                <RestorePreview
                    backup={preview}
                    onRestore={handleRestore}
                    onCreateServer={handleCreateServer}
                    onCancel={() => { setPreview(null); setStatus(""); }}
                    isRunning={isRunning}
                />
            )}
            {result && <RestoreResults result={result} />}
            {serverResult && <DiscordServerResult result={serverResult} />}
            {status && (
                <Forms.FormText style={{ color: status.includes("failed") || status.includes("Invalid") ? "var(--text-danger)" : "var(--text-muted)" }}>
                    {status}
                </Forms.FormText>
            )}
        </div>
    );
}

export default function BackupPanel() {
    return (
        <div>
            <BackupSection />
            <RestoreSection />
        </div>
    );
}
