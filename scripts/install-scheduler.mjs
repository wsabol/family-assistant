import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schedulerDir = join(root, "scheduler");
const cliPath = join(root, "dist", "cli", "index.js");

if (!existsSync(cliPath)) {
  console.error(`Missing ${cliPath}. Run npm run build before installing scheduled jobs.`);
  process.exit(1);
}

if (!existsSync(schedulerDir)) {
  console.error(`Missing ${schedulerDir}. Run npm run scheduler:generate first.`);
  process.exit(1);
}

if (process.platform === "darwin") {
  const launchdDir = join(schedulerDir, "launchd");
  const agentsDir = join(homedir(), "Library", "LaunchAgents");

  if (!existsSync(launchdDir)) {
    console.error(`Missing ${launchdDir}. Run npm run scheduler:generate first.`);
    process.exit(1);
  }

  const plists = readdirSync(launchdDir).filter((name) => name.endsWith(".plist"));
  mkdirSync(agentsDir, { recursive: true });

  const uid = execFileSync("id", ["-u"], { encoding: "utf8" }).trim();
  const domain = `gui/${uid}`;

  function getLabel(plistPath) {
    const content = readFileSync(plistPath, "utf8");
    const match = content.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/);
    if (!match?.[1]) {
      throw new Error(`Could not read Label from ${plistPath}`);
    }
    return match[1];
  }

  function bootout(label, dest) {
    try {
      execFileSync("launchctl", ["bootout", `${domain}/${label}`], {
        stdio: "ignore",
      });
    } catch {
      try {
        execFileSync("launchctl", ["bootout", domain, dest], { stdio: "ignore" });
      } catch {
        // Not loaded yet
      }
    }
  }

  for (const name of plists) {
    const src = join(launchdDir, name);
    const dest = join(agentsDir, name);
    const label = getLabel(src);
    bootout(label, dest);
    cpSync(src, dest);
    execFileSync("launchctl", ["bootstrap", domain, dest], {
      stdio: "inherit",
    });
    console.log(`Loaded ${label} (${dest})`);
  }

  console.log(`Installed and loaded ${plists.length} launchd job(s).`);
} else if (process.platform === "linux") {
  const systemdDir = join(schedulerDir, "systemd");
  const userSystemdDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(userSystemdDir, { recursive: true });

  if (!existsSync(systemdDir)) {
    console.error(`Missing ${systemdDir}. Run npm run scheduler:generate on Linux.`);
    process.exit(1);
  }

  for (const name of readdirSync(systemdDir)) {
    cpSync(join(systemdDir, name), join(userSystemdDir, name));
  }

  try {
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
    for (const name of readdirSync(systemdDir).filter((n) => n.endsWith(".timer"))) {
      execFileSync("systemctl", ["--user", "enable", "--now", name], {
        stdio: "inherit",
      });
    }
    console.log("Installed systemd user timers. Ensure user lingering is enabled if needed.");
  } catch (error) {
    console.error("systemctl install failed. See scheduler/crontab.txt for cron fallback.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (process.platform === "win32") {
  const windowsDir = join(schedulerDir, "windows");
  if (!existsSync(windowsDir)) {
    console.error(`Missing ${windowsDir}. Run npm run scheduler:generate on Windows.`);
    process.exit(1);
  }

  for (const name of readdirSync(windowsDir).filter((n) => n.endsWith(".ps1"))) {
    execFileSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", join(windowsDir, name)],
      { stdio: "inherit" },
    );
  }

  console.log("Registered Windows scheduled tasks.");
} else {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}
