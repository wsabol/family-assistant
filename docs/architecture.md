# Architecture

Family Assistant is a local pipeline that turns labeled school emails into approved Google Calendar events. Each stage has a narrow responsibility; crossing boundaries (for example, the worker writing to Calendar) is intentionally prevented.

## Pipeline overview

```mermaid
flowchart LR
  Gmail[Gmail labeled messages] --> Watch[watch]
  Watch --> Queue[(SQLite messages)]
  Queue --> Work[work / AI]
  Work --> Proposed[(proposed_actions)]
  Proposed --> MemoryMatch{high-confidence internal repeat/update?}
  MemoryMatch -->|yes| Approved[approved actions]
  MemoryMatch -->|no| AutoApprove{confidence 1.0?}
  AutoApprove -->|yes| Approved[approved actions]
  AutoApprove -->|no| Review[review UI / CLI]
  Review -->|approved| Approved
  Approved --> Write[write-calendar]
  Write --> Calendar[Google Calendar]
  Write --> Links[(calendar_links)]
```

## Stages

| Command | Module | Responsibility |
|---------|--------|----------------|
| `watch` | `src/gmail/` | Poll Gmail, normalize messages, dedupe by `gmail_message_id`, queue for processing |
| `work` | `src/ai/` | Extract actions, compare them contextually with completed internal actions, and auto-approve perfect-confidence new actions or high-confidence repeats and updates |
| `review` | `src/review/` | Local web UI (localhost) and CLI approve/reject for actions that are not auto-approved; preserve original vs approved payloads |
| `write-calendar` | `src/calendar/` | Create approved events, link internal repeats, and apply matched updates with reverse-chronological revision notes |

### Boundaries

- **Watcher** does not call AI or Calendar.
- **Worker** does not write Calendar; matching and automatic approval use only internal completed actions as event memory.
- **Calendar writer** only processes approved actions and skips actions that already have a calendar link.

## Data model

SQLite (WAL mode) with versioned migrations in `migrations/`.

Key tables:

- `messages` — source emails and processing status (`queued`, `processing`, `completed`, `failed`)
- `proposed_actions` — AI extractions with status (`awaiting_review`, `approved`, `rejected`, `superseded`, `writing`, `completed`, `failed`)
- `calendar_links` — maps `proposed_action_id` to Google Calendar event ID (unique index prevents duplicates)

Audit fields:

- `original_payload_json` — never overwritten (AI output at extraction time)
- `approved_payload_json` — set when an action is auto-approved, or when a human approves or edits from the review UI
- `matched_action_id`, `event_relationship`, and dedupe fields — preserve internal identity decisions and their reasoning

## Reprocessing

`reprocess <message-id>` marks existing `awaiting_review` and `approved` actions as `superseded`, resets the message to `queued`, and runs AI extraction again. Prior records remain for audit.

## Stale recovery

`STALE_PROCESSING_MINUTES` (default 30) resets stuck `processing` messages and `writing` actions so a crashed run can resume.

## Configuration

| File | Purpose |
|------|---------|
| `.env` | Paths, secrets, batch limits (see `.env.example`) |
| `config/family.json` | Timezone, children, Gmail label, calendar ID (see `config/family.example.json`) |

Grade is computed at runtime from `startedKindergarten`; it is not stored in config.

## Automation

On macOS, `launchd-template/` plists are rendered into `launchd/` (gitignored) and loaded with `npm run launchd:load`. Typical schedule: watch/work/write every 5 minutes; digest daily.

## Further reading

- [Product MVP plan](../.product/mvp.md) — full scope and milestones
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development and PR guidelines
