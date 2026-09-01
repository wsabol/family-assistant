# Contributing to Family Assistant

Thank you for your interest in contributing. This project is a local-first tool for turning school emails into reviewed calendar events. Contributions that improve reliability, clarity, and ease of setup are especially welcome.

## Before you start

1. Read the [README](README.md) for setup and daily workflow.
2. Skim [docs/architecture.md](docs/architecture.md) to understand pipeline boundaries.
3. Run `npm run doctor` after setup to confirm your environment.

## Development setup

```bash
git clone https://github.com/wsabol/family-assistant.git
cd family-assistant
npm install
cp .env.example .env
cp config/family.example.json config/family.json
# Edit .env and config/family.json with your credentials and family details
npm run migrate
npm run doctor
```

You do not need live Gmail, Calendar, or OpenAI credentials to run most unit tests.

## Making changes

### Branch and commit

1. Create a branch from `main`.
2. Keep changes focused. Prefer small, reviewable pull requests.
3. Use clear commit messages in the imperative mood (for example, `Fix calendar OAuth scopes`).

### Code style

- TypeScript with ESM (`"type": "module"`).
- Imports from `src/` use `.js` extensions (NodeNext resolution).
- Match existing patterns in the file you are editing.
- Use `createLogger()` for pipeline logging; CLI user output may use `console`.
- Throw `ConfigError` from config loading for user-facing configuration problems.

### Architecture boundaries

The pipeline has strict separation. Please preserve these rules:

| Stage | May do | Must not do |
|-------|--------|-------------|
| Watcher (`src/gmail/`) | Poll Gmail, queue messages | Call AI or Calendar |
| Worker (`src/ai/`) | Extract proposed actions | Write Calendar |
| Review (`src/review/`) | Approve/reject actions | Write Calendar |
| Calendar writer (`src/calendar/`) | Create approved events | Process unapproved actions |

See [docs/architecture.md](docs/architecture.md) for the full flow.

### Database changes

- Add versioned SQL files in `migrations/`.
- Update repository mappers in `src/db/repositories/` when schema changes.
- Add or update tests in `tests/unit/migrations.test.ts` when migrations change.

### Family config changes

If you change `familyConfigSchema` in `src/config.ts`:

1. Update `config/family.example.json`.
2. Update `buildFamilyContext()` in `src/ai/prompts.ts` if the AI needs the field.
3. Add tests in `tests/unit/config.test.ts` or `tests/unit/grade.test.ts`.

### Tests

Run the full check before opening a pull request:

```bash
npm run typecheck
npm test
```

Add unit tests for non-trivial logic. Tests live in `tests/unit/` and use Vitest.

Doctor tests avoid live API calls by unsetting token paths in the test environment.

## Pull requests

1. Fill out the pull request template.
2. Link any related issue.
3. Describe what you tested (commands run, scenarios checked).
4. Note any config, migration, or setup changes contributors need to know about.

CI runs `npm run typecheck` and `npm test` on each pull request.

## Reporting issues

- **Bugs**: use the bug report template. Include `npm run doctor` output when possible.
- **Features**: use the feature request template. Explain the problem and proposed behavior.
- **Security**: see [SECURITY.md](SECURITY.md). Do not open public issues for vulnerabilities.

## Scope guidance

Helpful contributions include:

- Setup and documentation improvements
- Test coverage for edge cases
- Clearer error messages and doctor checks
- Evaluation fixtures for school email extraction (Milestone 7)

Out of scope for the current MVP (but may be discussed in issues):

- Auto-approving AI actions without human review
- Sending or replying to email
- Remote multi-user access

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions

Open a [GitHub Discussion](https://github.com/wsabol/family-assistant/discussions) or issue if you are unsure whether a change fits. For small fixes, a pull request with a short description is fine.
