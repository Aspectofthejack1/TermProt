# TermProt / ProfileBackup

`ProfileBackup` is a Vencord user plugin that backs up key Discord profile data and helps you move it to another account.

## Trust and Transparency

- This plugin is open source and the code in this repo is the full plugin implementation.
- VirusTotal scan report: [ProfileBackup file analysis](https://www.virustotal.com/gui/file/cd9f701f8bbfa9937dd7154e6915a65036d30700d5ba7b1699d8a72881f24d2d?nocache=1)

## Current Feature Coverage

| Item | Backed up | Restored | Notes |
|---|---|---|---|
| Bio / About Me | Yes | Yes | |
| Pronouns | Yes | Yes | |
| Avatar | Yes | Yes | Stored as base64 in the backup file |
| Banner | Yes | Yes | Stored as base64 in the backup file |
| Accent color | Yes | Yes | |
| Custom status | Yes | Yes | |
| Favorite GIFs | Yes | Yes | Multiple restore strategies + fallback |
| Friends list | Yes | No direct re-add | Used in restore server reference channels |
| Servers + invite codes | Yes | No direct auto-join | Invite creation is cached per guild |
| Priority server tags | Yes | Via restore server | Tag from server context menu |
| Best friend tags | Yes | Via restore server | Tag from user context menu |

## What Restore Actually Does

There are two restore paths:

- **Apply Restore**: applies selected categories from the backup:
  - Profile data (bio, pronouns, avatar, banner, accent color)
  - Custom status
  - Favorite GIFs
- **Create Restore Server**: creates a helper server named `Restore - <username>` and fills channels with saved references:
  - `priority-servers`
  - `best-friends`
  - `servers`
  - `friends`

It does **not** auto-send friend requests or auto-join all saved servers.

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

Enable it in `Settings -> Vencord -> Plugins` as `ProfileBackup`.

## Vesktop Compatibility

`ProfileBackup` works on Vesktop when injected through a source-built Vencord install.

1. Install [Vesktop](https://github.com/Vencord/Vesktop).
2. Build Vencord from source and place this repo at `src/userplugins/ProfileBackup`.
3. Run `pnpm build` and `pnpm inject`.
4. In the injector UI, pick Vesktop as the target.
5. Restart Vesktop and enable `ProfileBackup`.

## Usage (Current UI Labels)

Open the gear icon next to `ProfileBackup` in Vencord's plugin list.

- **Backup Now**
  - Collects data and saves it to local Vencord DataStore.
  - Also attempts to save a `.json` file to `Documents/TermProtBackups`.
- **Save to Documents Folder**
  - Saves the current backup to `Documents/TermProtBackups`.
  - If native file saving is unavailable, it falls back to browser download.
- **Restore from File**
  - Load a `.json` backup and preview restore choices.
- **Restore from Last Auto-Backup**
  - Loads the latest DataStore backup and opens restore preview.
- **Apply Restore**
  - Applies checked restore categories.
- **Create Restore Server**
  - Creates the helper restore server and posts saved friend/server references.

## Auto-Backup

Auto-backup interval is configurable in plugin settings:
- hourly
- daily (default)
- weekly

On plugin start, if the last backup is older than the configured interval, it schedules a backup shortly after startup. Scheduled backups save to DataStore and also try saving to `Documents/TermProtBackups`.

## Context Menu Tags

The plugin adds quick tags in context menus:
- Right-click a server: **Priority Server**
- Right-click a user: **Best Friend**

These tags are stored and included in backups.

## Updating

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins\ProfileBackup
git pull
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

After any Vencord update, rebuild and inject again.

## Security Notes

- Keep exported backup files private.
- Backup files can include permanent server invite codes.
- Anyone with your backup file can read its contents.
- This plugin depends on Discord client/API behavior and account permissions/rate limits.
