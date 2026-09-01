import express from "express";
import type { Logger } from "pino";

import {
  familyConfigSchema,
  loadConfig,
  loadEnvConfig,
  resolvePath,
  saveFamilyConfig,
  type FamilyConfig,
} from "../config.js";
import { runDoctor, formatDoctorReport } from "../cli/doctor.js";
import { probeCredentials } from "../google/oauth.js";
import { HealthIncidentsRepository } from "../db/repositories/health-incidents.js";
import { runHealthMonitor } from "../health/monitor.js";
import { sendTestAlert } from "../health/alerts.js";
import { hasAlertChannel } from "../health/checks.js";
import { escapeHtml, layout } from "../ui/layout.js";

const ADMIN_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/config/family", label: "Family config" },
  { href: "/auth", label: "Authentication" },
  { href: "/health", label: "Health" },
];

function adminPage(title: string, body: string): string {
  const reviewPort = process.env.REVIEW_PORT ?? "3847";
  const nav = [
    { href: `http://127.0.0.1:${reviewPort}/`, label: "Review inbox" },
    ...ADMIN_NAV,
  ];
  return layout(title, nav, body);
}

export function createAdminApp(
  db: import("better-sqlite3").Database,
  logger: Logger,
): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  app.get("/", async (_req, res) => {
    const report = await runDoctor();
    const checks = report.checks
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.status)}</td><td>${escapeHtml(c.message)}</td></tr>`,
      )
      .join("");

    const platform =
      process.platform === "darwin"
        ? "macOS (launchd)"
        : process.platform === "linux"
          ? "Linux (systemd/cron)"
          : process.platform === "win32"
            ? "Windows (Task Scheduler)"
            : process.platform;

    const body = `
      <h1>Admin dashboard</h1>
      <p class="muted">Platform: ${escapeHtml(platform)} · Scheduler: <code>npm run scheduler:install</code></p>
      <p><strong>${report.passed ? "Overall: PASS" : "Overall: FAIL"}</strong></p>
      <table>
        <thead><tr><th>Check</th><th>Status</th><th>Message</th></tr></thead>
        <tbody>${checks}</tbody>
      </table>
      <pre style="display:none">${escapeHtml(formatDoctorReport(report))}</pre>`;

    res.type("html").send(adminPage("Dashboard", body));
  });

  app.get("/config/family", (_req, res) => {
    const config = loadConfig();
    const family = config.family;
    const children = family.children
      .map(
        (child, index) => `
        <fieldset>
          <legend>Child ${index + 1}</legend>
          <label>Name <input name="child_${index}_name" value="${escapeHtml(child.name)}" required /></label>
          <label>School <input name="child_${index}_school" value="${escapeHtml(child.school)}" required /></label>
          <label>Started kindergarten (year) <input name="child_${index}_startedKindergarten" type="number" value="${child.startedKindergarten}" required /></label>
          <label>Aliases (comma-separated) <input name="child_${index}_aliases" value="${escapeHtml(child.aliases.join(", "))}" /></label>
        </fieldset>`,
      )
      .join("");

    const guidelines = (family.interpretationGuidelines ?? []).join("\n");

    const body = `
      <h1>Family config</h1>
      <form method="post" action="/config/family" class="card">
        <label>Timezone <input name="timezone" value="${escapeHtml(family.timezone)}" required /></label>
        <label>Gmail label <input name="gmailLabel" value="${escapeHtml(family.gmailLabel)}" required /></label>
        <label>School calendar ID <input name="schoolCalendarId" value="${escapeHtml(family.schoolCalendarId)}" required /></label>
        ${children}
        <label>Interpretation guidelines (one per line)
          <textarea name="interpretationGuidelines" rows="4">${escapeHtml(guidelines)}</textarea>
        </label>
        <button type="submit" class="primary">Save</button>
      </form>`;

    res.type("html").send(adminPage("Family config", body));
  });

  app.post("/config/family", (req, res) => {
    try {
      const config = loadConfig();
      const body = req.body as Record<string, string>;
      const children = config.family.children.map((child, index) => ({
        name: body[`child_${index}_name`] ?? child.name,
        school: body[`child_${index}_school`] ?? child.school,
        startedKindergarten: Number(
          body[`child_${index}_startedKindergarten`] ?? child.startedKindergarten,
        ),
        aliases: (body[`child_${index}_aliases`] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }));

      const family: FamilyConfig = familyConfigSchema.parse({
        ...config.family,
        timezone: body.timezone,
        gmailLabel: body.gmailLabel,
        schoolCalendarId: body.schoolCalendarId,
        children,
        interpretationGuidelines: (body.interpretationGuidelines ?? "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });

      saveFamilyConfig(resolvePath(config.env.FAMILY_CONFIG_PATH), family);
      logger.info("Family config updated via admin UI");
      res.redirect("/config/family");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).type("html").send(adminPage("Error", `<p>${escapeHtml(message)}</p>`));
    }
  });

  app.get("/auth", async (_req, res) => {
    const env = loadEnvConfig();
    const gmail = await probeCredentials(env, "gmail");
    const calendar = await probeCredentials(env, "calendar");

    const body = `
      <h1>Authentication</h1>
      <div class="card">
        <h2>Gmail</h2>
        <p>Status: ${gmail.ok ? "OK" : gmail.tokenPresent ? "Failed" : "Not configured"}</p>
        ${gmail.expiresAt ? `<p class="muted">Expires: ${escapeHtml(gmail.expiresAt)}</p>` : ""}
        ${gmail.error ? `<p class="warn">${escapeHtml(gmail.error)}</p>` : ""}
        <p>Run in terminal: <code>family-assistant auth gmail</code></p>
      </div>
      <div class="card">
        <h2>Calendar</h2>
        <p>Status: ${calendar.ok ? "OK" : calendar.tokenPresent ? "Failed" : "Not configured"}</p>
        ${calendar.expiresAt ? `<p class="muted">Expires: ${escapeHtml(calendar.expiresAt)}</p>` : ""}
        ${calendar.error ? `<p class="warn">${escapeHtml(calendar.error)}</p>` : ""}
        <p>Run in terminal: <code>family-assistant auth calendar</code></p>
      </div>
      <p class="muted">OAuth runs in the CLI because it opens a local browser callback.</p>`;

    res.type("html").send(adminPage("Authentication", body));
  });

  app.get("/health", async (_req, res) => {
    const config = loadConfig();
    const incidentsRepo = new HealthIncidentsRepository(db);
    const open = incidentsRepo.listOpen();
    const recent = incidentsRepo.listRecent(10);

    const rows = recent
      .map(
        (i) =>
          `<tr><td>${escapeHtml(i.incidentType)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.message)}</td><td>${escapeHtml(i.lastSeenAt)}</td></tr>`,
      )
      .join("");

    const body = `
      <h1>Health</h1>
      <p>Open incidents: <strong>${open.length}</strong></p>
      <p>Alert channel: ${hasAlertChannel(config.env) ? "configured" : "not configured"}</p>
      <form method="post" action="/health/run" style="margin-bottom:1rem">
        <button type="submit">Run health check now</button>
      </form>
      <form method="post" action="/health/test-alert">
        <button type="submit">Send test alert</button>
      </form>
      <table>
        <thead><tr><th>Type</th><th>Status</th><th>Message</th><th>Last seen</th></tr></thead>
        <tbody>${rows || "<tr><td colspan='4'>No incidents recorded.</td></tr>"}</tbody>
      </table>`;

    res.type("html").send(adminPage("Health", body));
  });

  app.post("/health/run", async (_req, res) => {
    const config = loadConfig();
    await runHealthMonitor(config.env, db, config.family);
    res.redirect("/health");
  });

  app.post("/health/test-alert", async (_req, res) => {
    const env = loadEnvConfig();
    const sent = await sendTestAlert(env);
    const message = sent
      ? "Test alert sent."
      : "Failed to send test alert. Check ALERT_WEBHOOK_URL in .env.";
    res.type("html").send(adminPage("Test alert", `<p>${escapeHtml(message)}</p><p><a href="/health">Back</a></p>`));
  });

  return app;
}

export function startAdminServer(
  config: ReturnType<typeof loadConfig>,
  db: import("better-sqlite3").Database,
  logger: Logger,
): void {
  const app = createAdminApp(db, logger);
  const port = config.env.ADMIN_PORT;

  app.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    logger.info({ port, url }, "Admin server started");
    console.log(`Admin UI running at ${url}`);
  });
}
