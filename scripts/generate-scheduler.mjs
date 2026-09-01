import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "config", "scheduler.json");
const outDir = join(root, "scheduler");

function findNodePath() {
  try {
    return execSync(process.platform === "win32" ? "where node" : "which node", {
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/)[0];
  } catch {
    return process.platform === "win32" ? "node" : "/usr/bin/env node";
  }
}

function render(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function parseCron(cron) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(" ");
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function generateLaunchdPlist(job, projectRoot, nodePath, cliPath) {
  const label = `com.family-assistant.${job.name}`;
  const logBase = join(projectRoot, "data", "logs", `launchd-${job.name}`);

  let scheduleXml = "";
  if (job.cron) {
    const { minute, hour } = parseCron(job.cron);
    scheduleXml = `
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${Number(hour)}</integer>
    <key>Minute</key>
    <integer>${Number(minute)}</integer>
  </dict>`;
  } else {
    scheduleXml = `
  <key>StartInterval</key>
  <integer>${job.intervalSeconds ?? 300}</integer>
  ${job.runAtLoad ? "<key>RunAtLoad</key>\n  <true/>" : ""}`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
    <string>${job.command}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${projectRoot}</string>${scheduleXml}
  <key>StandardOutPath</key>
  <string>${logBase}.out.log</string>
  <key>StandardErrorPath</key>
  <string>${logBase}.err.log</string>
</dict>
</plist>
`;
}

function generateSystemd(job, projectRoot, nodePath, cliPath) {
  const serviceTemplate = readFileSync(
    join(root, "systemd-template", "job.service.template"),
    "utf8",
  );
  const timerTemplate = readFileSync(
    join(root, "systemd-template", "job.timer.template"),
    "utf8",
  );

  const service = render(serviceTemplate, {
    JOB_NAME: job.name,
    PROJECT_ROOT: projectRoot,
    NODE_PATH: nodePath,
    CLI_PATH: cliPath,
    COMMAND: job.command,
  });

  let timerSpec;
  if (job.cron) {
    const { minute, hour } = parseCron(job.cron);
    timerSpec = `OnCalendar=*-*-* ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`;
  } else {
    timerSpec = `OnBootSec=1min\nOnUnitActiveSec=${job.intervalSeconds ?? 300}s`;
  }

  const timer = render(timerTemplate, {
    JOB_NAME: job.name,
    TIMER_SPEC: timerSpec,
  });

  return { service, timer };
}

function generateCronLine(job, projectRoot, nodePath, cliPath) {
  if (job.cron) {
    return `${job.cron} cd ${projectRoot} && ${nodePath} ${cliPath} ${job.command} >> ${join(projectRoot, "data", "logs", `cron-${job.name}.log`)} 2>&1`;
  }
  const minutes = Math.max(1, Math.round((job.intervalSeconds ?? 300) / 60));
  return `*/${minutes} * * * * cd ${projectRoot} && ${nodePath} ${cliPath} ${job.command} >> ${join(projectRoot, "data", "logs", `cron-${job.name}.log`)} 2>&1`;
}

function generateWindowsScript(job, projectRoot, nodePath, cliPath) {
  const template = readFileSync(
    join(root, "windows-template", "register-task.ps1.template"),
    "utf8",
  );

  let triggerExpr;
  if (job.cron) {
    const { minute, hour } = parseCron(job.cron);
    triggerExpr = `New-ScheduledTaskTrigger -Daily -At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } else {
    const minutes = Math.max(1, Math.round((job.intervalSeconds ?? 300) / 60));
    triggerExpr = `New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes ${minutes}) -RepetitionDuration ([TimeSpan]::MaxValue)`;
  }

  return render(template, {
    JOB_NAME: job.name,
    PROJECT_ROOT: projectRoot,
    NODE_PATH: nodePath,
    CLI_PATH: cliPath,
    COMMAND: job.command,
    TRIGGER_EXPR: triggerExpr,
  });
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const jobs = manifest.jobs;
const nodePath = findNodePath();
const cliPath = join(root, "dist", "cli", "index.js");

mkdirSync(outDir, { recursive: true });

if (process.platform === "darwin") {
  const launchdDir = join(outDir, "launchd");
  mkdirSync(launchdDir, { recursive: true });

  for (const job of jobs) {
    const plist = generateLaunchdPlist(job, root, nodePath, cliPath);
    writeFileSync(join(launchdDir, `${job.name}.plist`), plist, "utf8");
    console.log(`Wrote ${join(launchdDir, `${job.name}.plist`)}`);
  }

  const legacyLaunchdDir = join(root, "launchd");
  mkdirSync(legacyLaunchdDir, { recursive: true });
  for (const name of readdirSync(join(outDir, "launchd"))) {
    writeFileSync(
      join(legacyLaunchdDir, name),
      readFileSync(join(outDir, "launchd", name), "utf8"),
      "utf8",
    );
  }
}

if (process.platform === "linux") {
  const systemdDir = join(outDir, "systemd");
  mkdirSync(systemdDir, { recursive: true });
  const cronLines = [];

  for (const job of jobs) {
    const { service, timer } = generateSystemd(job, root, nodePath, cliPath);
    writeFileSync(join(systemdDir, `family-assistant-${job.name}.service`), service, "utf8");
    writeFileSync(join(systemdDir, `family-assistant-${job.name}.timer`), timer, "utf8");
    cronLines.push(generateCronLine(job, root, nodePath, cliPath));
    console.log(`Wrote systemd units for ${job.name}`);
  }

  const cronTemplate = readFileSync(join(root, "cron-template", "crontab.template"), "utf8");
  writeFileSync(
    join(outDir, "crontab.txt"),
    render(cronTemplate, {
      PROJECT_ROOT: root,
      CRON_LINES: cronLines.join("\n"),
    }),
    "utf8",
  );
}

if (process.platform === "win32") {
  const windowsDir = join(outDir, "windows");
  mkdirSync(windowsDir, { recursive: true });

  for (const job of jobs) {
    const script = generateWindowsScript(job, root, nodePath, cliPath);
    writeFileSync(join(windowsDir, `register-${job.name}.ps1`), script, "utf8");
    console.log(`Wrote ${join(windowsDir, `register-${job.name}.ps1`)}`);
  }
}

console.log(`Generated scheduler artifacts in ${outDir} for ${process.platform}`);
