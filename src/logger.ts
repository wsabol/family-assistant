import { mkdirSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import pino, { type Logger, type LoggerOptions } from "pino";

import { type EnvConfig } from "./config.js";

export type LogComponent =
  | "cli"
  | "config"
  | "db"
  | "doctor"
  | "migrate"
  | "gmail"
  | "ai"
  | "calendar"
  | "review"
  | "digest"
  | "watch"
  | "work"
  | "write-calendar"
  | "status";

export function createLogger(
  env: Pick<EnvConfig, "LOG_LEVEL" | "LOG_DIR">,
  component: LogComponent,
): Logger {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { component },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (env.LOG_DIR) {
    ensureLogDirectory(env.LOG_DIR);
    const logFile = join(env.LOG_DIR, `${component}.log`);
    return pino(options, pino.destination({ dest: logFile, sync: true }));
  }

  return pino(options);
}

export function ensureLogDirectory(logDir: string): void {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

export function canWriteToLogDirectory(logDir: string): boolean {
  try {
    ensureLogDirectory(logDir);
    const testFile = join(logDir, ".write-test");
    writeFileSync(testFile, "ok");
    unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}
