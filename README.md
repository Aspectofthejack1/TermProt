# TermProt / ProfileBackup

`ProfileBackup` is a Vencord user plugin that backs up key Discord profile data and helps you migrate it to another account.

It is built for recovery and convenience: keep your profile details, favorite GIFs, and account organization data in a backup file you control.

## What It Backs Up

| Item | Backup | Restore | Notes |
|---|---|---|---|
| Bio / About Me | Yes | Yes | |
| Pronouns | Yes | Yes | |
| Avatar | Yes | Yes | Stored as base64 in the backup |
| Banner | Yes | Yes | Stored as base64 in the backup |
| Accent color | Yes | Yes | |
| Custom status | Yes | Yes | |
| Favorite GIFs | Yes | Yes | Restores with multiple fallback methods |
| Friends list | Yes | No direct re-add | Used for restore-server reference list |
| Servers + invite codes | Yes | No direct auto-join | Uses cached per-guild invite codes when possible |
| Priority server tags | Yes | N/A | Manual tags for organization |
| Best friend tags | Yes | N/A | Manual tags for organization |

## How Restore Works

There are two restore paths in the plugin:

- **Apply Restore**: restores profile fields, custom status, and favorite GIFs.
- **Create Restore Server**: creates a helper server with channels containing your saved server invites and friend mention lists.

It does **not** automatically send friend requests or auto-join every server.

## Install (Vencord Source Build)

Prerequisites:
- [Node.js LTS](https://nodejs.org/)
- [Git](https://git-scm.com/)
- [pnpm](https://pnpm.io/)

### Fresh Vencord setup

```powershell
cd ~
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
npm install -g pnpm
pnpm install
git clone https://github.com/Aspectofthejack1/TermProt.git src/userplugins/ProfileBackup
pnpm build
pnpm inject
```

### If you already have Vencord

```powershell
cd C:\Users\YOUR_USERNAME\Vencord
git clone https://github.com/Aspectofthejack1/TermProt.git src/userplugins/ProfileBackup
pnpm build
pnpm inject
```

### Enable plugin

1. Restart Discord.
2. Open `Settings -> Vencord -> Plugins`.
3. Search for `ProfileBackup`.
4. Enable it.

## Usage

Open the gear icon next to `ProfileBackup` in Vencord's plugin list.

- **Backup Now**: creates and saves a backup in Vencord DataStore.
- **Save to Documents Folder**: saves a `.json` backup file to `Documents/TermProtBackups`.
- **Restore from File**: loads a backup file and lets you choose what to apply.
- **Restore from Last Auto-Backup**: loads the most recent DataStore backup.
- **Create Restore Server**: creates a Discord server with:
  - `priority-servers`
  - `best-friends`
  - `servers`
  - `friends`

## Auto-Backup

Auto-backup interval is configurable in plugin settings:
- hourly
- daily (default)
- weekly

Backups are stored locally in Vencord DataStore and also auto-saved to `Documents/TermProtBackups` on desktop clients with native plugin support.

## Context Menu Tags

The plugin adds quick tags to Discord context menus:
- Right-click a server -> **Priority Server**
- Right-click a user -> **Best Friend**

These tags are included in backups and used when generating the restore server.

## Updating

### Update this plugin

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins\ProfileBackup
git pull
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

### After updating Vencord

`src/userplugins` is preserved. Rebuild and inject again:

```powershell
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

## Security Notes

- Keep exported backup files private.
- Backup files may include permanent server invite codes.
- Anyone with your backup file can read its contents.
- This plugin uses Discord client/API behavior and still depends on account limits/permissions.
