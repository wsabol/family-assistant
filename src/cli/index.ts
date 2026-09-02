#!/usr/bin/env node

import { Command } from "commander";

import { loadConfigForCommand } from "./config-loader.js";
import { runDoctorCommand } from "./doctor.js";
import { runAuthStatusCommand } from "./auth-status.js";
import { runDigest } from "./digest.js";
import { runStatus } from "./status.js";
import { createLogger } from "../logger.js";
import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { runWatcher } from "../gmail/watch.js";
import { runWorker, reprocessMessage } from "../ai/work.js";
import { runCalendarWriter } from "../calendar/write.js";
import { startReviewServer } from "../review/server.js";
import { startAdminServer } from "../admin/server.js";
import { authorizeInteractive } from "../google/oauth.js";
import { actionToApprovedPayload } from "../calendar/event-mapper.js";
import { ProposedActionsRepository } from "../db/repositories/proposed-actions.js";
import { MessagesRepository } from "../db/repositories/messages.js";
import { runSetupCommand } from "../setup/wizard.js";
import { runHealthMonitor } from "../health/monitor.js";
import { loadEnvConfig } from "../config.js";

const program = new Command();

program
  .name("family-assistant")
  .description("Local family executive assistant for school email automation")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check environment, config, database, and integration readiness")
  .action(async () => {
    const code = await runDoctorCommand();
    process.exit(code);
  });

program
  .command("setup")
  .description("Interactive setup wizard for config and authentication")
  .option("--non-interactive", "Validate setup files without prompts")
  .action(async (options: { nonInteractive?: boolean }) => {
    const code = await runSetupCommand({ nonInteractive: options.nonInteractive });
    process.exit(code);
  });

program
  .command("migrate")
  .description("Apply pending database migrations")
  .action(() => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "migrate");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      const result = runMigrations(db);

      if (result.applied.length === 0) {
        logger.info("No pending migrations");
        console.log("No pending migrations.");
      } else {
        logger.info({ applied: result.applied }, "Applied migrations");
        console.log(`Applied migrations: ${result.applied.join(", ")}`);
      }
    } finally {
      db.close();
    }
  });

program
  .command("auth")
  .description("Authorize Google APIs")
  .argument("[service]", "gmail, calendar, or omit for status")
  .action(async (service?: string) => {
    if (!service) {
      const code = await runAuthStatusCommand();
      process.exit(code);
      return;
    }

    if (service === "status") {
      const code = await runAuthStatusCommand();
      process.exit(code);
      return;
    }

    if (service !== "gmail" && service !== "calendar") {
      console.error("Service must be 'gmail' or 'calendar'");
      process.exit(1);
    }

    const env = loadEnvConfig();
    await authorizeInteractive(env, service);
  });

program
  .command("health")
  .description("Run health checks and send alerts for auth/integration failures")
  .action(async () => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "health");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const result = await runHealthMonitor(config.env, db, config.family);
      for (const check of result.checks) {
        console.log(`[${check.ok ? "PASS" : "FAIL"}] ${check.name}: ${check.message}`);
      }
      console.log(
        `Health: open=${result.openIncidents} resolved=${result.resolvedIncidents} alerts=${result.alertsSent}`,
      );
      logger.info(result, "Health check completed");
    } finally {
      db.close();
    }
  });

program
  .command("watch")
  .description("Poll Gmail for labeled school messages")
  .action(async () => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "watch");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const result = await runWatcher(config, db, logger);
      console.log(
        `Watch complete: fetched=${result.fetched} stored=${result.stored} skipped=${result.skipped} errors=${result.errors}`,
      );
    } finally {
      db.close();
    }
  });

program
  .command("work")
  .description("Process queued messages with AI extraction")
  .action(async () => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "work");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const result = await runWorker(config, db, logger);
      console.log(
        `Work complete: claimed=${result.claimed} processed=${result.processed} failed=${result.failed} actions=${result.actionsCreated}`,
      );
    } finally {
      db.close();
    }
  });

program
  .command("write-calendar")
  .description("Create Google Calendar events for approved actions")
  .action(async () => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "write-calendar");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const result = await runCalendarWriter(config, db, logger);
      console.log(
        `Calendar write complete: claimed=${result.claimed} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
      );
    } finally {
      db.close();
    }
  });

program
  .command("digest")
  .description("Generate the daily processing summary markdown report")
  .action(() => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "digest");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      runDigest(config, db, logger);
    } finally {
      db.close();
    }
  });

program
  .command("review")
  .description("Start the local review web interface")
  .action(() => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "review");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      startReviewServer(config, db, logger);
    } catch (error) {
      db.close();
      throw error;
    }
  });

program
  .command("admin")
  .description("Start the local admin web interface for config and health")
  .action(() => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "admin");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      startAdminServer(config, db, logger);
    } catch (error) {
      db.close();
      throw error;
    }
  });

program
  .command("status")
  .description("Show processing queue and review status")
  .action(() => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "status");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      runStatus(db, logger);
    } finally {
      db.close();
    }
  });

program
  .command("approve")
  .description("Approve a proposed action from the CLI")
  .argument("<action-id>", "Proposed action ID")
  .action((actionId: string) => {
    const config = loadConfigForCommand();
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const actionsRepo = new ProposedActionsRepository(db);
      const action = actionsRepo.findById(Number(actionId));

      if (!action) {
        console.error(`Action not found: ${actionId}`);
        process.exit(1);
      }

      const payload = actionToApprovedPayload(action);
      actionsRepo.approve(Number(actionId), payload);
      console.log(`Approved action #${actionId}`);
    } finally {
      db.close();
    }
  });

program
  .command("reject")
  .description("Reject a proposed action from the CLI")
  .argument("<action-id>", "Proposed action ID")
  .action((actionId: string) => {
    const config = loadConfigForCommand();
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      const actionsRepo = new ProposedActionsRepository(db);
      actionsRepo.reject(Number(actionId));
      console.log(`Rejected action #${actionId}`);
    } finally {
      db.close();
    }
  });

program
  .command("reprocess")
  .description("Reprocess a message with AI (supersedes prior awaiting/approved actions)")
  .argument("<message-id>", "Internal message ID")
  .option("--instructions <text>", "Interpretation instructions for re-extraction")
  .action(async (messageId: string, options: { instructions?: string }) => {
    const config = loadConfigForCommand();
    const logger = createLogger(config.env, "work");
    const db = openDatabase(config.env.DATABASE_PATH);

    try {
      runMigrations(db);
      if (options.instructions !== undefined) {
        const messagesRepo = new MessagesRepository(db);
        messagesRepo.setInterpretationInstructions(
          Number(messageId),
          options.instructions,
        );
      }
      await reprocessMessage(config, db, Number(messageId), logger, {
        interpretationInstructions: options.instructions,
      });
      console.log(`Reprocessed message #${messageId}`);
    } finally {
      db.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
