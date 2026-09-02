import { ConfigError, loadConfig } from "../config.js";

export function loadConfigForCommand() {
  try {
    return loadConfig();
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(message);
    process.exit(1);
  }
}
