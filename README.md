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

> **Vesktop users:** the `pnpm inject` step above patches the **Discord desktop app** only. Vesktop bundles its own Vencord and is set up a different way — **do not run `pnpm inject`**. Follow [Using ProfileBackup on Vesktop](#using-profilebackup-on-vesktop) instead.

## Using ProfileBackup on Vesktop

[Vesktop](https://github.com/Vencord/Vesktop) ships with its own copy of Vencord baked into the app, so it is **not** patched with the Vencord installer. Instead, you point Vesktop at a Vencord build you compiled from source (which includes `ProfileBackup`).

> **Do not use `pnpm inject` or the installer's "Custom Location" for Vesktop.** The installer only recognizes a real Discord install (it looks for Discord-only files like `resources/build_info.json`). Pointing it at your Vesktop folder — e.g. `...\AppData\Local\vesktop` — will fail with `ERROR Invalid Discord install!` even though that path is correct. That is expected; use the steps below instead.

### Steps

1. Install [Vesktop](https://github.com/Vencord/Vesktop) and launch it at least once.
2. Clone Vencord from source and add this repo as a userplugin:
   ```powershell
   cd ~
   git clone https://github.com/Vendicated/Vencord.git
   cd Vencord
   npm install -g pnpm
   pnpm install
   git clone https://github.com/Aspectofthejack1/TermProt.git src/userplugins/ProfileBackup
   pnpm build
   ```
   `pnpm build` writes the compiled Vencord (with `ProfileBackup` bundled in) to the `dist` folder inside your `Vencord` directory. Note that full path — you need it in the next step.
3. In Vesktop, open **Settings**, scroll to **"Vencord Location"**, click **Change**, and select your `Vencord\dist` folder (e.g. `C:\Users\YOUR_USERNAME\Vencord\dist`).
   - Pick the **`dist`** folder — not the Vesktop install folder, and not this `ProfileBackup` folder.
4. **Fully quit and restart Vesktop.** Closing to the tray is not enough — right-click the Vesktop tray icon and choose **Quit**, then reopen it.
5. Enable it in `Settings -> Vencord -> Plugins` as `ProfileBackup`.

### Updating on Vesktop

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins\ProfileBackup
git pull
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
```

Then fully quit and reopen Vesktop. You do **not** re-run `pnpm inject` — as long as "Vencord Location" still points at your `dist` folder, Vesktop loads the fresh build on restart.

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

## Updating (Discord Desktop)

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins\ProfileBackup
git pull
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

After any Vencord update, rebuild and inject again.

> On **Vesktop**, update with [Updating on Vesktop](#updating-on-vesktop) instead — rebuild and restart, no `pnpm inject`.

## Security Notes

- Keep exported backup files private.
- Backup files can include permanent server invite codes.
- Anyone with your backup file can read its contents.
- This plugin depends on Discord client/API behavior and account permissions/rate limits.
