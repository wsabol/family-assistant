# Family Assistant

[![CI](https://github.com/wsabol/family-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/wsabol/family-assistant/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Local family executive assistant that watches Gmail for school-related messages, extracts proposed calendar actions with AI, requires human review, and writes approved events to Google Calendar.

**Philosophy:** reliable, transparent, and reversible. AI proposes; you approve. Nothing hits your calendar without an explicit human decision.

## Features

- Poll Gmail for messages with a label you choose
- Extract events, deadlines, and reminders with OpenAI structured output
- Review and edit proposals in a local web UI (localhost only)
- Create approved events on a dedicated school calendar
- Full audit trail in SQLite (source email → proposed action → calendar event)
- Daily markdown digest and `launchd` templates for macOS automation

## Requirements

- Node.js 22 or newer
- npm
- Google Cloud project with Gmail API and Calendar API enabled
- OpenAI API key

## Quick start

```bash
git clone https://github.com/wsabol/family-assistant.git
cd family-assistant
npm install
npm run dev -- setup
```

The setup wizard creates `.env` and `config/family.json`, guides Google OAuth, runs migrations, and runs doctor. See [docs/google-cloud-setup.md](docs/google-cloud-setup.md) for Google Cloud configuration.

Manual setup:

```bash
cp .env.example .env
cp config/family.example.json config/family.json
# edit .env and config/family.json
npm run migrate
npm run dev -- auth gmail
npm run dev -- auth calendar
npm run doctor
```

When doctor reports **Overall: PASS**, you are ready to run the pipeline.

## Daily workflow

```bash
npm run dev -- watch          # ingest labeled Gmail messages
npm run dev -- work           # AI extraction for queued messages
npm run dev -- review         # local review UI at http://127.0.0.1:3847
npm run dev -- admin          # config/auth/health UI at http://127.0.0.1:3848
npm run dev -- write-calendar # create events for approved actions
npm run dev -- digest         # markdown summary in data/digests/
npm run dev -- status         # queue and review counts
npm run dev -- health         # proactive health check + alerts
```

After building:

```bash
npm run build
npx family-assistant watch
```

## CLI commands

| Command | Description |
|---------|-------------|
| `setup` | Interactive setup wizard (`--non-interactive` to validate only) |
| `auth gmail` | OAuth for Gmail (read + label) |
| `auth calendar` | OAuth for Calendar events |
| `auth` / `auth status` | Show Gmail/Calendar auth probe status |
| `admin` | Local admin UI for config, auth status, health |
| `health` | Run health checks and send webhook alerts |
| `watch` | Poll Gmail for labeled messages |
| `work` | Process queued messages with AI |
| `review` | Start review web UI (localhost) |
| `approve <id>` | Approve action from CLI |
| `reject <id>` | Reject action from CLI |
| `reprocess <message-id>` | Re-run AI (`--instructions "..."` optional) |
| `write-calendar` | Create Google Calendar events |
| `digest` | Write daily markdown digest |
| `status` | Show queue status |
| `doctor` | Health checks |
| `migrate` | Apply database migrations |
| `scheduler:generate` | Build scheduler artifacts for this OS |
| `scheduler:install` | Install scheduled jobs (macOS/Linux/Windows) |

## Architecture

```mermaid
flowchart LR
  Gmail[Gmail] --> Watch[watch]
  Watch --> DB[(SQLite)]
  DB --> Work[work]
  Work --> Review[review]
  Review -->|approved| Write[write-calendar]
  Write --> Cal[Google Calendar]
```

Each stage has strict boundaries: the watcher never calls AI or Calendar; the worker never writes Calendar; only approved actions are written. See [docs/architecture.md](docs/architecture.md).

## Reprocessing

## Reprocessing and interpretation instructions

`reprocess` marks existing `awaiting_review` and `approved` actions as `superseded`, then queues the message for a fresh AI extraction. Add human guidance with:

```bash
npm run dev -- reprocess 42 --instructions "This is for 1st grade only"
```

In the review UI, save instructions on the message detail page before reprocessing. Standing guidelines can be set in `config/family.json` under `interpretationGuidelines`.

## Automation (cross-platform)

Jobs are defined in [`config/scheduler.json`](config/scheduler.json). See [docs/scheduling.md](docs/scheduling.md).

```bash
npm run build
npm run scheduler:install
```

Includes watcher, worker, calendar-writer (every 5 min), digest (daily 8pm), and health checks (every 15 min).

## Alerts

Configure `ALERT_WEBHOOK_URL` in `.env` to receive notifications when Gmail/Calendar auth fails. See [docs/alerts.md](docs/alerts.md).

## Data and privacy

Everything runs on your machine:

- SQLite database: `DATABASE_PATH` (default `./data/family-assistant.db`)
- OAuth tokens: `GOOGLE_TOKEN_PATH`, `GOOGLE_CALENDAR_TOKEN_PATH`
- Logs: `LOG_DIR`
- Digests: `DIGEST_DIR`

Back up the database and token files regularly. They are not committed to git. See [SECURITY.md](SECURITY.md).

## Family config

`config/family.example.json` shows the shape. Per child:

| Field | Description |
|-------|-------------|
| `name` | Child name |
| `aliases` | Optional nicknames for AI matching |
| `school` | School name |
| `startedKindergarten` | Calendar year they started kindergarten (e.g. `2020`) |

Optional: `interpretationGuidelines` (array of strings), `reviewHints` (UI sorting thresholds).

Grade is derived at runtime — do not add a `grade` field.

## Development

```bash
npm run typecheck
npm test
npm run test:watch
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, architecture rules, and how to open a pull request.

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

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

## License

[MIT](LICENSE) — Copyright (c) 2026 Will Sabol
