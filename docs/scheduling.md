# Scheduling

Family Assistant runs as short-lived batch jobs on a schedule. Use the unified scheduler commands:

```bash
npm run build
npm run scheduler:generate   # write platform artifacts to scheduler/
npm run scheduler:install    # install and enable jobs on this machine
```

`launchd:generate` and `launchd:load` are aliases for the commands above.

## Job manifest

[`config/scheduler.json`](../config/scheduler.json) is the single source of truth:

| Job | Command | Schedule |
|-----|---------|----------|
| watcher | `watch` | Every 5 minutes |
| worker | `work` | Every 5 minutes |
| calendar-writer | `write-calendar` | Every 5 minutes |
| digest | `digest` | Daily at 8:00 PM local |
| health | `health` | Every 15 minutes |

## macOS (launchd)

Artifacts: `scheduler/launchd/*.plist` (also copied to `launchd/` for compatibility).

Install copies plists to `~/Library/LaunchAgents` and runs `launchctl bootstrap`.

## Linux (systemd)

Artifacts: `scheduler/systemd/*.service` and `*.timer` in `~/.config/systemd/user/`.

Requires `systemctl --user`. For jobs to run when you are logged out, enable user lingering:

```bash
sudo loginctl enable-linger $USER
```

### Cron fallback

If systemd is unavailable, use `scheduler/crontab.txt` as a reference and merge lines into your user crontab (`crontab -e`).

## Windows (Task Scheduler)

Artifacts: `scheduler/windows/register-*.ps1`

Run install from an elevated PowerShell if task registration fails:

```powershell
npm run scheduler:install
```

## Environment

Scheduled jobs need access to your `.env` file in the project root. systemd units reference `EnvironmentFile`. launchd inherits a minimal environment — ensure paths in `.env` are absolute or relative to `WorkingDirectory`.

## Manual runs

All pipeline commands work without a scheduler:

```bash
npm run dev -- watch
npm run dev -- work
npm run dev -- write-calendar
npm run dev -- health
```
