import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launchdDir = join(root, "launchd");
const agentsDir = join(homedir(), "Library/LaunchAgents");

if (process.platform !== "darwin") {
  console.error("launchd:load only runs on macOS.");
  process.exit(1);
}

if (!existsSync(launchdDir)) {
  console.error(
    `Missing ${launchdDir}. Run npm run launchd:generate first.`,
  );
  process.exit(1);
}

const plists = readdirSync(launchdDir).filter((name) => name.endsWith(".plist"));

if (plists.length === 0) {
  console.error(`No plist files found in ${launchdDir}`);
  process.exit(1);
}

mkdirSync(agentsDir, { recursive: true });

const uid = execSync("id -u", { encoding: "utf8" }).trim();
const domain = `gui/${uid}`;

function getLabel(plistPath) {
  const content = readFileSync(plistPath, "utf8");
  const match = content.match(
    /<key>Label<\/key>\s*<string>([^<]+)<\/string>/,
  );

  if (!match?.[1]) {
    throw new Error(`Could not read Label from ${plistPath}`);
  }

  return match[1];
}

function bootout(label, dest) {
  try {
    execSync(`launchctl bootout ${domain}/${label}`, { stdio: "ignore" });
  } catch {
    try {
      execSync(`launchctl bootout ${domain} ${dest}`, { stdio: "ignore" });
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
  execSync(`launchctl bootstrap ${domain} ${dest}`, { stdio: "inherit" });
  console.log(`Loaded ${label} (${dest})`);
}

console.log(`Installed and loaded ${plists.length} launchd job(s).`);
