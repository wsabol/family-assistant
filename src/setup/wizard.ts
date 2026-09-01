import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  familyConfigSchema,
  loadEnvConfig,
  loadFamilyConfig,
  type FamilyConfig,
} from "../config.js";
import { authorizeInteractive } from "../google/oauth.js";
import { runDoctorCommand } from "../cli/doctor.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";

export interface SetupOptions {
  nonInteractive?: boolean;
}

function projectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function ensureEnvFile(root: string): string {
  const envPath = join(root, ".env");
  const examplePath = join(root, ".env.example");

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
    } else {
      writeFileSync(envPath, "DATABASE_PATH=./data/family-assistant.db\n", "utf8");
    }
  }

  return envPath;
}

function ensureFamilyConfig(root: string): string {
  const configPath = join(root, "config", "family.json");
  const examplePath = join(root, "config", "family.example.json");

  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    copyFileSync(examplePath, configPath);
  }

  return configPath;
}

function updateEnvValue(envPath: string, key: string, value: string): void {
  const content = readFileSync(envPath, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    writeFileSync(envPath, content.replace(pattern, line), "utf8");
  } else {
    writeFileSync(envPath, `${content.trimEnd()}\n${line}\n`, "utf8");
  }
}

function readEnvValue(envPath: string, key: string): string {
  const content = readFileSync(envPath, "utf8");
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

async function runInteractiveSetup(root: string): Promise<void> {
  const rl = createInterface({ input, output });
  const envPath = ensureEnvFile(root);
  const familyPath = ensureFamilyConfig(root);

  console.log("Family Assistant Setup");
  console.log("======================\n");
  console.log("Google Cloud setup guide: docs/google-cloud-setup.md\n");

  const timezone = await prompt(rl, "Family timezone", "America/Chicago");
  const gmailLabel = await prompt(rl, "Gmail label for school emails", "School");
  const schoolCalendarId = await prompt(rl, "School Google Calendar ID");
  const childName = await prompt(rl, "First child name", "Child 1");
  const childSchool = await prompt(rl, "First child school", "School Name");
  const startedK = await prompt(rl, "Year they started kindergarten", "2020");

  const familyRaw = JSON.parse(readFileSync(familyPath, "utf8")) as FamilyConfig;
  familyRaw.timezone = timezone;
  familyRaw.gmailLabel = gmailLabel;
  familyRaw.schoolCalendarId = schoolCalendarId || familyRaw.schoolCalendarId;
  familyRaw.children = [
    {
      name: childName,
      aliases: familyRaw.children[0]?.aliases ?? [],
      school: childSchool,
      startedKindergarten: Number(startedK),
    },
  ];

  const parsedFamily = familyConfigSchema.parse(familyRaw);
  writeFileSync(familyPath, `${JSON.stringify(parsedFamily, null, 2)}\n`, "utf8");

  let clientId = readEnvValue(envPath, "GOOGLE_CLIENT_ID");
  let clientSecret = readEnvValue(envPath, "GOOGLE_CLIENT_SECRET");

  if (!clientId) {
    clientId = await prompt(rl, "Google OAuth client ID");
    if (clientId) {
      updateEnvValue(envPath, "GOOGLE_CLIENT_ID", clientId);
    }
  }

  if (!clientSecret) {
    clientSecret = await prompt(rl, "Google OAuth client secret");
    if (clientSecret) {
      updateEnvValue(envPath, "GOOGLE_CLIENT_SECRET", clientSecret);
    }
  }

  const aiKey = readEnvValue(envPath, "AI_API_KEY");
  if (!aiKey) {
    const entered = await prompt(rl, "OpenAI API key (optional, press Enter to skip)");
    if (entered) {
      updateEnvValue(envPath, "AI_API_KEY", entered);
    }
  }

  const env = loadEnvConfig();
  const runGmail = await prompt(rl, "Authorize Gmail now? (y/n)", "y");
  if (runGmail.toLowerCase().startsWith("y")) {
    await authorizeInteractive(env, "gmail");
  }

  const runCalendar = await prompt(rl, "Authorize Calendar now? (y/n)", "y");
  if (runCalendar.toLowerCase().startsWith("y")) {
    await authorizeInteractive(loadEnvConfig(), "calendar");
  }

  rl.close();

  const finalEnv = loadEnvConfig();
  mkdirSync(dirname(resolve(finalEnv.DATABASE_PATH)), { recursive: true });
  const db = openDatabase(finalEnv.DATABASE_PATH);
  runMigrations(db);
  db.close();

  console.log("\nRunning doctor...\n");
  await runDoctorCommand();

  console.log("\nSetup complete. Next steps:");
  console.log("  npm run dev -- watch");
  console.log("  npm run dev -- review");
  console.log("  npm run dev -- admin");
  console.log("  npm run scheduler:install   # macOS/Linux/Windows");
}

function runNonInteractiveSetup(root: string): number {
  const errors: string[] = [];
  const envPath = ensureEnvFile(root);
  const familyPath = ensureFamilyConfig(root);

  try {
    loadEnvConfig();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const family = loadFamilyConfig(familyPath);
    if (family.schoolCalendarId === "replace-me") {
      errors.push("Set schoolCalendarId in config/family.json");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (!readEnvValue(envPath, "GOOGLE_CLIENT_ID")) {
    errors.push("GOOGLE_CLIENT_ID is not set in .env");
  }
  if (!readEnvValue(envPath, "GOOGLE_CLIENT_SECRET")) {
    errors.push("GOOGLE_CLIENT_SECRET is not set in .env");
  }

  if (errors.length > 0) {
    console.error("Setup validation failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    return 1;
  }

  console.log("Setup validation passed. Run without --non-interactive for guided setup.");
  return 0;
}

export async function runSetupCommand(options: SetupOptions = {}): Promise<number> {
  const root = projectRoot();

  if (options.nonInteractive) {
    return runNonInteractiveSetup(root);
  }

  await runInteractiveSetup(root);
  return 0;
}
