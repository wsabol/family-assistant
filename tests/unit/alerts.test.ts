import { describe, expect, it } from "vitest";

import { buildWebhookBody, type AlertPayload } from "../../src/health/alerts.js";

const payload: AlertPayload = {
  incidentType: "gmail_auth",
  status: "open",
  message: "Authentication failed",
  timestamp: "2026-09-02T00:00:00.000Z",
};

describe("buildWebhookBody", () => {
  it("uses Slack's text payload", () => {
    expect(buildWebhookBody("https://hooks.slack.com/services/a/b/c", payload)).toEqual({
      text: expect.stringContaining("Authentication failed"),
    });
  });

  it("uses Discord's content payload", () => {
    expect(buildWebhookBody("https://discord.com/api/webhooks/1/token", payload)).toEqual({
      content: expect.stringContaining("Authentication failed"),
    });
  });

  it("preserves the structured payload for generic webhooks", () => {
    expect(buildWebhookBody("https://example.com/hooks/family", payload)).toEqual(payload);
  });
});
