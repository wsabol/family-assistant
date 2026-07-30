import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { google } from "googleapis";

import { type EnvConfig, isConfigured, resolvePath } from "../config.js";

export type GoogleService = "gmail" | "calendar";
export type GoogleOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];

export function getScopesForService(service: GoogleService): string[] {
  return service === "gmail" ? GMAIL_SCOPES : CALENDAR_SCOPES;
}

export function getTokenPathForService(
  env: EnvConfig,
  service: GoogleService,
): string {
  if (service === "gmail") {
    if (!env.GOOGLE_TOKEN_PATH) {
      throw new Error("GOOGLE_TOKEN_PATH is required for Gmail authentication");
    }
    return resolvePath(env.GOOGLE_TOKEN_PATH);
  }

  if (!env.GOOGLE_CALENDAR_TOKEN_PATH) {
    throw new Error(
      "GOOGLE_CALENDAR_TOKEN_PATH is required for Calendar authentication",
    );
  }
  return resolvePath(env.GOOGLE_CALENDAR_TOKEN_PATH);
}

export function createOAuth2Client(env: EnvConfig) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for Google OAuth",
    );
  }

  const redirectUri = `http://localhost:${env.OAUTH_REDIRECT_PORT}/oauth2callback`;

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

export function loadSavedCredentials(
  env: EnvConfig,
  service: GoogleService,
): GoogleOAuth2Client | null {
  if (service === "gmail" && !isConfigured(env.GOOGLE_TOKEN_PATH)) {
    return null;
  }

  if (service === "calendar" && !isConfigured(env.GOOGLE_CALENDAR_TOKEN_PATH)) {
    return null;
  }

  const tokenPath = getTokenPathForService(env, service);

  if (!existsSync(tokenPath)) {
    return null;
  }

  const oauth2Client = createOAuth2Client(env);
  const tokens = JSON.parse(readFileSync(tokenPath, "utf8"));
  oauth2Client.setCredentials(tokens);

  return oauth2Client;
}

export function saveCredentials(
  env: EnvConfig,
  service: GoogleService,
  tokens: object,
): void {
  const tokenPath = getTokenPathForService(env, service);
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
}

export async function authorizeInteractive(
  env: EnvConfig,
  service: GoogleService,
): Promise<GoogleOAuth2Client> {
  const oauth2Client = createOAuth2Client(env);
  const scopes = getScopesForService(service);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  console.log(`Authorize ${service} access by visiting:\n${authUrl}\n`);

  const code = await waitForOAuthCode(env.OAUTH_REDIRECT_PORT);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  saveCredentials(env, service, tokens);

  console.log(`Saved ${service} credentials to ${getTokenPathForService(env, service)}`);

  return oauth2Client;
}

function waitForOAuthCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400);
          res.end("Authorization failed.");
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("Missing code parameter.");
          return;
        }

        res.writeHead(200);
        res.end("Authorization successful. You can close this tab.");
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.on("error", reject);
    server.listen(port, () => {
      console.log(`Listening for OAuth callback on http://localhost:${port}`);
    });
  });
}

export async function getAuthorizedClient(
  env: EnvConfig,
  service: GoogleService,
): Promise<GoogleOAuth2Client> {
  const existing = loadSavedCredentials(env, service);
  if (existing) {
    return existing;
  }

  throw new Error(
    `No saved ${service} credentials. Run: family-assistant auth ${service}`,
  );
}
