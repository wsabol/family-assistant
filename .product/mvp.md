# Family Executive Assistant: School Email Automation Implementation Plan

## 1. Objective

Build a local family executive-assistant system that:

1. Watches Gmail for school-related messages.
2. Extracts calendar events, deadlines, reminders, and actionable items.
3. Presents proposed actions for human review.
4. Writes approved events to Google Calendar
5. Maintains a complete audit trail and prevents duplicates.

The initial release should prioritize reliability, transparency, and reversibility over full autonomy.

---

## 2. MVP Scope

### Included

* Poll Gmail for messages with a designated label.
* Store source emails locally.
* Process messages with an AI model.
* Extract zero or more proposed actions.
* Validate AI output against a strict schema.
* Review, edit, approve, or reject proposed actions.
* Create approved Google Calendar events.
* Store links between Gmail messages, proposed actions, and calendar events.
* Generate a daily processing summary.
* Run automatically on a Mac using `launchd`.

### Excluded from MVP

* Sending or replying to email.
* Deleting or modifying existing calendar events.
* Automatically approving AI-generated actions.
* Shopping-list integrations.
* Weather-aware scheduling.
* Sports schedule ingestion.
* Household task management.
* Autonomous rescheduling.
* Multi-user remote access.

---

## 3. Design Principles

### Deterministic boundaries

Use ordinary application code for:

* Gmail retrieval
* Persistence
* Deduplication
* Schema validation
* Calendar creation
* Retry handling
* Logging

Use AI only for:

* Classification
* Date and time interpretation
* Child identification
* Event extraction
* Action extraction
* Ambiguity detection
* Short source summarization

### Human approval first

All proposed actions must require review during the MVP.

Automatic approval may be introduced later only for well-tested action types and confidence levels.

### Auditability

Every proposed or completed action must be traceable back to:

* The source Gmail message
* The AI extraction result
* The approved payload
* The resulting Google Calendar event

### Idempotency

Reprocessing the same email must not create duplicate queue items, proposed actions, or calendar events.

---

## 4. Recommended Architecture

```text
Gmail
  |
  v
Watcher
  |
  v
SQLite Queue
  |
  v
AI Worker
  |
  v
Proposed Actions
  |
  v
Review Interface
  |
  v
Calendar Writer
  |
  v
Google Calendar
```

### Components

#### Watcher

Responsibilities:

* Authenticate with Gmail.
* Search for unprocessed messages with the configured label.
* Fetch message metadata and readable content.
* Normalize plain text and HTML email bodies.
* Save messages to SQLite.
* Avoid duplicate ingestion.
* Queue new messages for processing.

The watcher must not call the AI model or modify the calendar.

#### Worker

Responsibilities:

* Claim queued messages.
* Build the model request.
* Request structured output.
* Validate the returned payload.
* Store proposed actions.
* Route ambiguous results to review.
* Record model, prompt version, and processing metadata.
* Retry transient failures safely.

The worker must not write directly to Google Calendar.

#### Review Interface

Responsibilities:

* Show the source email and extracted actions together.
* Allow the user to edit extracted values.
* Approve or reject each action independently.
* Clearly display ambiguities and assumptions.
* Preserve the original AI payload separately from user edits.

#### Calendar Writer

Responsibilities:

* Read approved calendar actions.
* Perform final validation.
* Create Google Calendar events.
* Store the returned Google Calendar event ID.
* Mark the action completed.
* Avoid creating an event more than once.

The calendar writer must only process explicitly approved actions.

#### Daily Digest

Responsibilities:

* Summarize newly processed emails.
* List created events.
* List ignored emails.
* List items awaiting review.
* List errors requiring attention.

For the MVP, the digest may be printed to a local report or sent to a designated email address.

---

## 5. Technology Choices

### Runtime

Use TypeScript with Node.js.

Reasons:

* Strong schema and type support
* Straightforward Gmail and Google Calendar integrations
* Easy JSON handling
* Good fit for local services and scheduled jobs
* Familiarity with the existing development environment

### Suggested libraries

* Google APIs client for Gmail and Calendar
* SQLite database driver
* Zod or JSON Schema for runtime validation
* A lightweight HTTP framework for the review interface
* A structured logger
* A migration tool or simple versioned SQL migrations
* An AI SDK that supports structured JSON output

Avoid introducing a message broker during the MVP. SQLite can serve as the queue and persistence layer.

### Process scheduling

Use macOS `launchd`, not cron.

Create separate scheduled processes for:

* Gmail watcher
* AI worker
* Calendar writer
* Daily digest

Each process should also be runnable manually from the command line.

---

## 6. Suggested Repository Structure

```text
family-assistant/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── config/
│   ├── family.example.json
│   └── prompts/
│       └── school-email-v1.txt
├── migrations/
│   └── 001_initial.sql
├── src/
│   ├── cli/
│   │   ├── watch.ts
│   │   ├── work.ts
│   │   ├── review.ts
│   │   ├── write-calendar.ts
│   │   └── digest.ts
│   ├── gmail/
│   │   ├── client.ts
│   │   ├── search.ts
│   │   └── normalize-message.ts
│   ├── ai/
│   │   ├── client.ts
│   │   ├── extract-actions.ts
│   │   ├── prompts.ts
│   │   └── schemas.ts
│   ├── calendar/
│   │   ├── client.ts
│   │   ├── create-event.ts
│   │   └── event-mapper.ts
│   ├── review/
│   │   ├── server.ts
│   │   ├── routes.ts
│   │   └── views/
│   ├── db/
│   │   ├── connection.ts
│   │   ├── migrations.ts
│   │   └── repositories/
│   ├── domain/
│   │   ├── message.ts
│   │   ├── proposed-action.ts
│   │   └── action-status.ts
│   ├── config.ts
│   └── logger.ts
├── tests/
│   ├── fixtures/
│   │   └── school-emails/
│   ├── unit/
│   └── integration/
└── launchd/
    ├── watcher.plist
    ├── worker.plist
    ├── calendar-writer.plist
    └── digest.plist
```

---

## 7. Domain Model

### Message

```ts
interface Message {
  id: number;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string;
  senderName: string | null;
  senderEmail: string;
  receivedAt: string;
  bodyText: string;
  sourceLabel: string;
  status:
    | "queued"
    | "processing"
    | "processed"
    | "failed";
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Proposed Action

```ts
type ProposedActionType =
  | "calendar_event"
  | "deadline"
  | "bring_item"
  | "school_closure"
  | "volunteer_opportunity"
  | "informational"
  | "needs_review";

interface ProposedAction {
  id: number;
  messageId: number;
  actionType: ProposedActionType;

  childName: string | null;
  title: string;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;

  reminderOffsetsMinutes: number[];

  confidence: number;
  ambiguityReason: string | null;
  interpretationSummary: string | null;
  sourceExcerpt: string | null;

  originalPayloadJson: string;
  approvedPayloadJson: string | null;

  status:
    | "awaiting_review"
    | "approved"
    | "rejected"
    | "writing"
    | "completed"
    | "failed";

  createdAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
}
```

### Calendar Link

```ts
interface CalendarLink {
  id: number;
  proposedActionId: number;
  googleCalendarId: string;
  googleEventId: string;
  eventHtmlLink: string | null;
  createdAt: string;
}
```

---

## 8. AI Output Contract

The model must return an object containing an array of actions.

```ts
interface ExtractionResult {
  emailClassification:
    | "actionable"
    | "informational"
    | "ambiguous";

  summary: string;

  actions: Array<{
    actionType:
      | "calendar_event"
      | "deadline"
      | "bring_item"
      | "school_closure"
      | "volunteer_opportunity"
      | "needs_review";

    childName: string | null;
    title: string;
    startAt: string | null;
    endAt: string | null;
    allDay: boolean;
    location: string | null;
    description: string | null;
    reminderOffsetsMinutes: number[];

    confidence: number;
    ambiguityReason: string | null;
    interpretationSummary: string;
    sourceExcerpt: string;
  }>;
}
```

### Required model rules

* Return structured data only.
* Do not invent dates, times, locations, or children.
* Resolve relative dates using the email received date and configured timezone.
* Preserve uncertainty rather than guessing.
* Produce separate actions for separate events or deadlines.
* Treat an RSVP deadline separately from the event itself.
* Ignore general newsletters unless they contain a concrete family action.
* Use `needs_review` when multiple interpretations are reasonable.
* Use `null` when a field is unknown.
* Include a short explanation of every interpreted relative date.
* Include only a short source excerpt, not the entire email.

---

## 9. Family Configuration

Store family-specific context outside the prompt code.

Example:

```json
{
  "timezone": "America/Chicago",
  "schoolCalendarId": "replace-me",
  "gmailLabel": "School",
  "children": [
    {
      "name": "Child 1",
      "aliases": [],
      "school": "School Name",
      "startedKindergarten": 2020
    }
  ],
  "defaultEventDurationMinutes": 60,
  "defaultAllDayReminderMinutes": [1080],
  "defaultTimedEventReminderMinutes": [60]
}
```

Do not hard-code child names, schools, or calendar IDs in source files.

---

## 10. Workflow Details

### Gmail ingestion

Search query:

```text
label:School
```

The watcher should rely primarily on Gmail message IDs for deduplication.

Optionally add a Gmail label after successful ingestion:

```text
FamilyAssistant/Queued
```

After successful processing:

```text
FamilyAssistant/Processed
```

After a permanent error:

```text
FamilyAssistant/Error
```

Local database state remains the authoritative processing record.

### Email normalization

The normalizer should:

* Prefer readable plain text when available.
* Convert HTML to text when necessary.
* Remove repeated signatures and quoted thread history where practical.
* Preserve links when they appear important.
* Limit the model input to a configurable maximum size.
* Retain the complete raw body locally for audit purposes.

### Queue claiming

Use a database transaction to claim work.

A worker should:

1. Select one queued message.
2. Mark it processing.
3. Commit the claim.
4. Process the message.
5. Mark it processed or failed.

Stale processing records should become eligible for retry after a configured timeout.

### Calendar event mapping

Example title conventions:

```text
[Child Name] Picture Day
[Child Name] Field Trip
School Closed
Permission Slip Due — [Child Name]
Bring Instrument — [Child Name]
```

Example event description:

```text
For: [Child Name]
Source: [Email subject]
From: [Sender]
Received: [Timestamp]

[Short action summary]

Source excerpt:
[Short excerpt]

Created by Family Executive Assistant.
Gmail message ID: [ID]
```

---

## 11. Review Interface

Build a minimal local web interface.

### Inbox view

Show:

* Source email subject
* Sender
* Received date
* Number of proposed actions
* Processing status
* Confidence indicator
* Ambiguity indicator

### Action review view

Show side by side:

* Source email
* Proposed action form

Editable fields:

* Action type
* Child
* Title
* Date
* Start time
* End time
* All-day status
* Location
* Description
* Reminders

Actions:

* Approve
* Reject
* Save edits
* Reprocess with AI

### Review safety

Approval must save a distinct approved payload.

Never overwrite the original model response.

---

## 12. CLI Commands

Provide a single CLI with subcommands:

```bash
family-assistant auth gmail
family-assistant auth calendar

family-assistant watch
family-assistant work
family-assistant write-calendar
family-assistant digest

family-assistant review
family-assistant approve <action-id>
family-assistant reject <action-id>

family-assistant reprocess <message-id>
family-assistant status
family-assistant doctor
```

### `doctor` checks

* Environment variables
* Database connectivity
* Gmail credentials
* Calendar credentials
* AI credentials
* Config validity
* Calendar access
* Required Gmail labels
* Writable log directory

---

## 13. Implementation Milestones

## Milestone 1: Project foundation

Deliverables:

* TypeScript project
* Configuration loader
* Environment validation
* SQLite connection
* Migration runner
* Structured logging
* Basic CLI
* Test framework

Acceptance criteria:

* Application starts locally.
* Database migrations run successfully.
* Invalid configuration produces clear errors.
* `family-assistant doctor` reports system status.

---

## Milestone 2: Gmail watcher

Deliverables:

* Gmail OAuth flow
* Gmail label search
* Message retrieval
* Email normalization
* SQLite message persistence
* Deduplication
* Watcher CLI command

Acceptance criteria:

* A labeled school email is stored locally.
* Running the watcher twice does not duplicate it.
* HTML and plain-text emails are readable.
* Failed Gmail calls are retried safely.
* No AI or calendar action occurs.

---

## Milestone 3: AI extraction worker

Deliverables:

* Extraction schema
* Versioned system prompt
* AI client
* Worker queue claiming
* Structured-output validation
* Proposed-action persistence
* Retry and failure handling

Acceptance criteria:

* One email can produce zero, one, or multiple actions.
* Invalid AI output is rejected.
* Relative dates are resolved using the email timestamp.
* Ambiguous dates are flagged.
* The source model and prompt version are recorded.
* No calendar changes occur.

---

## Milestone 4: Review interface

Deliverables:

* Local web server
* Message list
* Action review form
* Edit, approve, and reject operations
* Original-versus-approved payload preservation

Acceptance criteria:

* The source email and proposal are visible together.
* Every proposed field can be corrected.
* Approval records the approved payload.
* Rejection does not delete the source record.
* Unapproved actions cannot be written to the calendar.

---

## Milestone 5: Calendar writer

Deliverables:

* Google Calendar OAuth flow
* Event mapper
* Approved-action processor
* Calendar event creation
* Calendar-link persistence
* Duplicate protection

Acceptance criteria:

* An approved action creates exactly one event.
* Re-running the writer does not create duplicates.
* Event metadata links back to the source email.
* The Google event ID is stored locally.
* Failed writes remain retryable.
* Rejected and pending actions are ignored.

---

## Milestone 6: Automation and operations

Deliverables:

* `launchd` configuration
* Log rotation
* Stale-job recovery
* Daily digest
* Installation instructions
* Backup instructions

Acceptance criteria:

* The system recovers after a Mac restart.
* Jobs run without an interactive terminal.
* Failures appear in logs and the digest.
* SQLite data is backed up.
* Credentials are not stored in the repository.

---

## Milestone 7: Evaluation and hardening

Create a fixture set of at least 30 historical school emails covering:

* Single event
* Multiple events
* Relative dates
* No year provided
* Deadline plus event
* School closure
* Early release
* Field trip
* Spirit day
* Picture day
* Supply request
* Volunteer request
* Newsletter with no action
* Email covering multiple children
* Corrected event date
* Cancelled event
* Ambiguous date
* Missing time
* Forwarded email
* Long email thread

Acceptance criteria:

* No duplicate calendar events.
* No fabricated dates.
* Every ambiguity is surfaced.
* Each extracted action is traceable to source text.
* Informational emails do not produce calendar clutter.
* Multiple events are not incorrectly merged.

---

## 14. Testing Strategy

### Unit tests

Cover:

* Email normalization
* Gmail message parsing
* Date conversion
* Timezone handling
* Schema validation
* Event-title formatting
* Idempotency keys
* Status transitions
* Calendar payload mapping

### Integration tests

Cover:

* Gmail fixture to stored message
* Stored message to proposed actions
* Approved action to mocked Calendar API
* Retry behavior
* Duplicate-processing behavior
* Database migrations

### AI evaluation tests

AI outputs are nondeterministic, so test for required properties rather than exact wording.

Assertions should include:

* Expected action count range
* Correct action type
* Date correctness
* No invented child
* Required ambiguity flags
* Presence of source evidence
* Valid schema

Save model outputs during evaluation to make regressions inspectable.

---

## 15. Security and Privacy

* Use least-privilege Gmail scopes where practical.
* Request Calendar access only for the selected family calendar.
* Keep OAuth credentials and tokens outside source control.
* Bind the review interface to localhost by default.
* Do not expose the review UI to the public internet.
* Redact sensitive email content from ordinary logs.
* Store only necessary message content.
* Document how to purge local data.
* Never permit email sending in the MVP.
* Never permit arbitrary tool execution from email content.
* Treat all email content as untrusted input.

The AI worker must never interpret instructions inside an email as system commands.

---

## 16. Observability

Use structured logs with:

* Component
* Operation
* Gmail message ID
* Internal message ID
* Proposed action ID
* Attempt number
* Status
* Duration
* Error category

Track basic metrics:

* Messages ingested
* Messages processed
* Actions proposed
* Actions approved
* Actions rejected
* Calendar events created
* Processing failures
* Average review confidence
* Duplicate attempts prevented

---

## 17. Initial Automation Schedule

Suggested `launchd` cadence:

```text
Watcher: every 5 minutes
Worker: every 5 minutes
Calendar writer: every 5 minutes
Daily digest: once each evening
```

Each job should process all currently available work up to a configured batch limit, then exit.

Avoid building long-running daemons until there is a demonstrated need.

---

## 18. Definition of Done for MVP

The MVP is complete when this full workflow succeeds reliably:

1. A school email receives the configured Gmail label.
2. The watcher stores it exactly once.
3. The worker extracts zero or more valid proposed actions.
4. The user reviews and approves an action.
5. The calendar writer creates exactly one Google Calendar event.
6. The event includes a traceable source reference.
7. Re-running any component does not create duplicates.
8. Failures are visible and retryable.
9. The system restarts automatically after a Mac reboot.

---

## 19. Post-MVP Roadmap

Add capabilities in this order:

1. High-confidence automatic approval for narrowly defined event types
2. Updates and cancellation detection
3. Permission-slip and bring-item reminders
4. Child-specific routing
5. Daily family briefing
6. Sports and activity calendar ingestion
7. Shopping-list integration
8. Scheduling conflict detection
9. Weather-aware reminders
10. Broader OpenClaw executive-assistant orchestration

OpenClaw should become the higher-level coordinator only after the deterministic email-to-calendar pipeline is reliable.

---

## 20. Instructions for the Coding Agent

Implement one milestone at a time.

For each milestone:

1. Review the existing repository before making changes.
2. State assumptions.
3. Propose the files to create or modify.
4. Implement the smallest complete vertical slice.
5. Add tests.
6. Run formatting, type checking, and tests.
7. Update the README.
8. Report:

   * Files changed
   * Commands run
   * Test results
   * Remaining limitations
   * Recommended next milestone

Do not implement later milestones prematurely.

Do not replace deterministic application logic with agent reasoning.

Do not create calendar events until explicit approval exists in the database.

Do not silently recover from invalid AI output. Record the failure and preserve the response for debugging.

Prefer clear, conventional code over generalized frameworks or speculative abstractions.
