# TermProt (ProfileBackup) — Vencord Plugin

Insurance against Discord account termination. Automatically backs up your entire profile so you can restore it on a new account in one click.

## What Gets Backed Up

| Data | Auto-Restore | Notes |
|------|-------------|-------|
| Bio / About Me | Yes | |
| Pronouns | Yes | |
| Avatar (profile pic) | Yes | Saved as full image, not just a link |
| Banner & accent color | Yes | |
| Custom status | Yes | |
| Favorite GIFs | Yes | Preserved in correct order |
| Friends list | Partial | Sends friend requests — they still need to accept |
| Server list | Partial | Creates permanent invite links — some servers may need manual rejoin |

## Installation (Windows)

You need: [Node.js](https://nodejs.org) (LTS), [Git](https://git-scm.com/download/win), and a terminal (PowerShell works).

### Fresh install (never built Vencord from source)

Open PowerShell and paste this whole block:

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

### Already have Vencord from source

Open PowerShell, go to your Vencord folder, and paste:

```powershell
cd C:\Users\YOUR_USERNAME\Vencord
git clone https://github.com/Aspectofthejack1/TermProt.git src/userplugins/ProfileBackup
pnpm build
pnpm inject
```

## Add this plugin to your existing Vencord

If you already have Vencord installed and just want to add this plugin:

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins
git clone https://github.com/Aspectofthejack1/TermProt.git ProfileBackup
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

### Enable the plugin

1. Restart Discord
2. Go to **Settings > Vencord > Plugins**
3. Search **ProfileBackup**
4. Toggle it on

## Updating the plugin

```powershell
cd C:\Users\YOUR_USERNAME\Vencord\src\userplugins\ProfileBackup
git pull
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
```

Then restart Discord.

## Updating Vencord itself

Use the Vencord installer like normal — click update. The plugin lives in `src/userplugins/` which Vencord **never touches** during updates. Your plugin survives automatically. After a Vencord update, just rebuild:

```powershell
cd C:\Users\YOUR_USERNAME\Vencord
pnpm build
pnpm inject
```

## Usage

Open the plugin settings (click the gear icon next to ProfileBackup in the plugins list):

- **Backup Now** — saves a backup to local storage
- **Export to File** — downloads a `.json` backup file (keep this safe!)
- **Restore from File** — upload a backup file, preview what's in it, pick what to restore, hit apply
- **Restore from Last Auto-Backup** — restore from the most recent auto-backup in local storage
- **Auto-backup interval** — set to hourly, daily, or weekly in the dropdown

## How auto-backup works

Once enabled, the plugin backs up your profile automatically on a schedule (default: daily). This means if your account gets termed unexpectedly, you always have a recent backup saved locally. You don't need to remember to export manually.

**But you should still export to a file regularly** — local storage backups are lost if you reinstall Discord or wipe your PC. Keep the `.json` file somewhere safe (USB drive, cloud storage, etc.).

## How restore works

1. Install the plugin on your new account
2. Click **Restore from File** and pick your backup `.json`
3. A preview shows what's in the backup (friends count, server count, etc.)
4. Check/uncheck what you want to restore
5. Click **Apply**
6. The plugin restores your profile, sends friend requests, and joins servers

Friend requests are sent with delays to avoid rate limits. Friends will see a request from your new account and need to accept it.

Servers are joined via permanent invite links that were created during backup. If you didn't have Create Invite permission in a server, that server's name is saved but you'll need to find an invite yourself.

## Security

- **Keep your backup file private.** It contains permanent invite links to your servers. Anyone with the file could use those invites.
- The plugin uses Discord's own API — it doesn't do anything the Discord client can't already do.
- Invite links are cached by server ID so the plugin doesn't spam new invites on every backup.
- On a brand new account, don't restore everything at once if you have hundreds of friends/servers. A new account mass-joining and mass-friending can look suspicious. Space it out if possible.
