# Alerts

Family Assistant can notify you when Gmail or Calendar authentication fails, or when health checks detect other integration problems.

## Configuration

Add to `.env`:

```env
ALERT_WEBHOOK_URL=https://your-webhook.example/hooks/abc123
```

Generic webhooks receive a JSON POST:

```json
{
  "incidentType": "gmail_auth",
  "status": "open",
  "message": "Request had invalid authentication credentials.",
  "timestamp": "2026-02-01T20:15:00.000Z"
}
```

When an incident resolves, a second notification is sent with `"status": "resolved"`.

Slack and Discord webhook URLs are detected automatically and receive their required `text` or `content` payload shape. n8n and other generic HTTP receivers receive the JSON object above.

## When alerts fire

- **`family-assistant health`** — run manually or on a schedule (every 15 minutes via scheduler)
- **Pipeline auth failures** — `watch` and `write-calendar` record Gmail/Calendar 401/403 errors

Alerts are deduplicated: one notification per open incident until it resolves.

## Test your setup

1. Set `ALERT_WEBHOOK_URL` in `.env`
2. Start the admin UI: `npm run dev -- admin`
3. Open **Health** → **Send test alert**

Or run a health check:

```bash
npm run dev -- health
```

## Admin UI

The admin dashboard at `http://127.0.0.1:3848/health` (default) shows open incidents and recent history.

## Doctor

`npm run doctor` validates `ALERT_WEBHOOK_URL` shape when set.

## Privacy

Alerts stay on your infrastructure. Family Assistant does not send telemetry to the project maintainer.
