# Security Policy

## Supported versions

Family Assistant is pre-1.0 software. Security fixes are applied on the `main` branch. There are no long-term release branches yet.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **wsabol39@gmail.com** with:

- A description of the issue and potential impact
- Steps to reproduce, if applicable
- Any suggested fix or mitigation

You should receive a response within a few business days. If the report is accepted, we will coordinate on a fix and disclosure timeline before any public announcement.

## Security model

Family Assistant is designed to run **locally on your machine**:

- The review UI binds to localhost only.
- OAuth tokens and the SQLite database stay in paths you configure (defaults under `./data/`).
- School email content is stored locally for audit and reprocessing.
- The app does not send email or modify calendar events without explicit human approval.

When self-hosting, protect:

- `.env` (API keys and OAuth client secret)
- `GOOGLE_TOKEN_PATH` and `GOOGLE_CALENDAR_TOKEN_PATH`
- `DATABASE_PATH`
- `config/family.json`

These files are gitignored by default. Back them up securely and do not commit them.

## Dependency updates

Report dependency vulnerabilities through the email above or via a private GitHub security advisory if you have access. Routine dependency updates are welcome as pull requests with passing tests.
