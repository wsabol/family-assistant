# Google Cloud setup

Family Assistant uses one Google Cloud OAuth client for both Gmail and Calendar. You authorize each API separately; tokens are stored in different files (`GOOGLE_TOKEN_PATH` and `GOOGLE_CALENDAR_TOKEN_PATH`).

## 1. Create a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Note the project name; you will enable APIs on it next.

## 2. Enable APIs

In **APIs & Services → Library**, enable:

- **Gmail API**
- **Google Calendar API**

## 3. Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (unless you use a Google Workspace org and prefer Internal).
3. Fill in the required app information.
4. Add scopes (you can also add these when creating credentials):
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add your Google account as a **test user** while the app is in testing mode.

Testing mode is fine for personal use. Only test users you add can sign in until you publish the app.

## 4. Create OAuth client credentials

1. Go to **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**.
3. Application type: **Desktop app** (or **Web application** with a localhost redirect — see below).
4. Download or copy the **Client ID** and **Client secret**.

Add them to `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

### Redirect URI

The CLI starts a temporary local server for OAuth. Default redirect:

```
http://localhost:3456/oauth2callback
```

`OAUTH_REDIRECT_PORT` in `.env` controls the port (default `3456`). If you use a Web application OAuth client in Google Cloud, add this exact redirect URI to the client configuration.

## 5. Authorize Gmail and Calendar

From the project root:

```bash
npm run dev -- auth gmail
npm run dev -- auth calendar
```

Each command opens a browser window. Sign in with the Google account that has access to your school Gmail label and target calendar.

Tokens are written to:

- `./data/tokens/gmail.json` (default)
- `./data/tokens/calendar.json` (default)

Keep these files private. They are listed in `.gitignore`.

## 6. Gmail label

1. In Gmail, create a label matching `gmailLabel` in `config/family.json` (default example: `School`).
2. Apply that label to school-related messages (manually or with a Gmail filter).
3. Family Assistant watches only messages with this label.

## 7. Calendar ID

Set `schoolCalendarId` in `config/family.json` to the calendar where approved events should be created.

To find a calendar ID in Google Calendar:

1. Open **Settings** for the calendar.
2. Scroll to **Integrate calendar**.
3. Copy the **Calendar ID** (often an email-like string or `...@group.calendar.google.com`).

## 8. Verify

```bash
npm run doctor
```

Doctor checks OAuth configuration, saved tokens, label existence, and calendar access. Fix any `FAIL` items before running the daily workflow.

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| `redirect_uri_mismatch` | Redirect URI in Google Cloud matches `http://localhost:<OAUTH_REDIRECT_PORT>/oauth2callback` |
| `access_denied` | Your account is a test user on the OAuth consent screen |
| Gmail label not found | Label name in Gmail exactly matches `gmailLabel` in family config |
| Calendar access failed | Calendar ID is correct and the authorized account can create events on that calendar |
| Token expired / revoked | Re-run `auth gmail` or `auth calendar` |

For more help, open a [GitHub Discussion](https://github.com/wsabol/family-assistant/discussions) or issue with `npm run doctor` output (redact secrets).
