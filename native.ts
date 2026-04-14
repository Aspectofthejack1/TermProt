import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

const BACKUP_DIR_NAME = "TermProtBackups";

function sanitizeFileName(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "-");
}

export async function saveBackupToDocuments(_event: Electron.IpcMainInvokeEvent, backupJson: string, fileName: string): Promise<string> {
    const documentsDir = path.join(homedir(), "Documents");
    const backupDir = path.join(documentsDir, BACKUP_DIR_NAME);
    await fs.mkdir(backupDir, { recursive: true });

    const safeName = sanitizeFileName(fileName);
    const fullPath = path.join(backupDir, safeName);
    await fs.writeFile(fullPath, backupJson, "utf8");
    return fullPath;
}
