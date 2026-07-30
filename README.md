# Family Assistant

Local family executive assistant that watches Gmail for school-related messages, extracts proposed calendar actions with AI, requires human review, and writes approved events to Google Calendar (syncing to Hearth Display via Google Calendar).

## Requirements

- Node.js 20 or newer
- npm
- Google Cloud project with Gmail API and Calendar API enabled
- OpenAI API key

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment and family config templates:

```bash
cp .env.example .env
cp config/family.example.json config/family.json
```

3. Edit `config/family.json` with your timezone, Gmail label, children, and school calendar ID.

4. Configure `.env` with Google OAuth credentials, token paths, and `AI_API_KEY`.

5. Run migrations:

```bash
npm run migrate
```

6. Authorize Google APIs (separate token files for Gmail and Calendar):

```bash
npm run dev -- auth gmail
npm run dev -- auth calendar
```

7. Verify the system:

```bash
npm run doctor
```

## Daily workflow

```bash
npm run dev -- watch          # ingest labeled Gmail messages
npm run dev -- work           # AI extraction for queued messages
npm run dev -- review         # local review UI at http://127.0.0.1:3847
npm run dev -- write-calendar # create events for approved actions
npm run dev -- digest         # markdown summary in data/digests/
npm run dev -- status         # queue and review counts
```

After building:

```bash
npm run build
npx family-assistant watch
```

## CLI commands

| Command | Description |
|---------|-------------|
| `auth gmail` | OAuth for Gmail (read + label) |
| `auth calendar` | OAuth for Calendar events |
| `watch` | Poll Gmail for labeled messages |
| `work` | Process queued messages with AI |
| `review` | Start review web UI (localhost) |
| `approve <id>` | Approve action from CLI |
| `reject <id>` | Reject action from CLI |
| `reprocess <message-id>` | Re-run AI; supersedes prior awaiting/approved actions |
| `write-calendar` | Create Google Calendar events |
| `digest` | Write daily markdown digest |
| `status` | Show queue status |
| `doctor` | Health checks |
| `migrate` | Apply database migrations |

## Reprocessing

`reprocess` marks existing `awaiting_review` and `approved` actions as `superseded`, then queues the message for a fresh AI extraction. Original records are preserved for audit.

## Automation (launchd)

Example plists are generated from [`launchd-template/`](launchd-template/) into [`launchd/`](launchd/) (gitignored):

```bash
npm run launchd:generate
```

Install into LaunchAgents and load (regenerates plists first):

```bash
npm run build
npm run launchd:load
```

Suggested schedule: watcher/work/calendar-writer every 5 minutes; digest daily at 8pm.

## Data and backups

- SQLite database: `DATABASE_PATH` (default `./data/family-assistant.db`)
- OAuth tokens: `GOOGLE_TOKEN_PATH`, `GOOGLE_CALENDAR_TOKEN_PATH`
- Logs: `LOG_DIR`
- Digests: `DIGEST_DIR`

Back up the database and token files regularly. They are not committed to git.

## Development

```bash
npm run typecheck
npm test
npm run test:watch
```

## Project status

Implemented:

- Milestone 1: project foundation
- Milestone 2: Gmail watcher
- Milestone 3: AI extraction worker (OpenAI)
- Milestone 4: Review interface (server-rendered)
- Milestone 5: Calendar writer
- Milestone 6: Digest, launchd templates, operations docs

Pending:

- Milestone 7: Evaluation fixture corpus and hardening (collect historical school emails)

See [`.product/mvp.md`](.product/mvp.md) for the full plan.
