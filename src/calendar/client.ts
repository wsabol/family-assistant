import { google } from "googleapis";

import { type EnvConfig } from "../config.js";
import { getAuthorizedClient } from "../google/oauth.js";

export async function createCalendarClient(env: EnvConfig) {
  const auth = await getAuthorizedClient(env, "calendar");
  return google.calendar({ version: "v3", auth });
}

export async function verifyCalendarAccess(
  env: EnvConfig,
  calendarId: string,
): Promise<void> {
  const calendar = await createCalendarClient(env);
  await calendar.calendars.get({ calendarId });
}
