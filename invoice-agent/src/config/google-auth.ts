import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/** Gmail read + Sheets write (same OAuth consent). */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
];

type OAuthClientJson = {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
};

export class GoogleNotConnectedError extends Error {
  constructor(message = "Gmail is not connected. Open Connect Gmail in Ledgerman.") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

async function loadClientSecrets(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}> {
  const raw = await fs.readFile(env.googleCredentialsPath, "utf8");
  const json = JSON.parse(raw) as OAuthClientJson;
  const cfg = json.installed ?? json.web;

  if (!cfg?.client_id || !cfg?.client_secret) {
    throw new Error(
      `Invalid OAuth credentials at ${env.googleCredentialsPath}.`
    );
  }

  return {
    clientId: cfg.client_id,
    clientSecret: cfg.client_secret,
    redirectUri: env.googleOauthRedirectUri,
  };
}

async function createOAuthClient(): Promise<OAuth2Client> {
  const { clientId, clientSecret, redirectUri } = await loadClientSecrets();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function saveTokens(tokens: object): Promise<void> {
  await fs.mkdir(path.dirname(env.googleTokenPath), { recursive: true });
  await fs.writeFile(env.googleTokenPath, JSON.stringify(tokens, null, 2));
  logger.info(`Saved token → ${env.googleTokenPath}`);
}

async function readStoredTokens(): Promise<{
  access_token?: string;
  refresh_token?: string;
  scope?: string;
} | null> {
  try {
    const tokenRaw = await fs.readFile(env.googleTokenPath, "utf8");
    return JSON.parse(tokenRaw) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
    };
  } catch {
    return null;
  }
}

function scopesMissing(tokens: { scope?: string }): string[] {
  const scopes = tokens.scope?.split(" ") ?? [];
  return GOOGLE_SCOPES.filter((s) => !scopes.includes(s));
}

let cachedAuth: OAuth2Client | null = null;

export function clearGoogleAuthCache(): void {
  cachedAuth = null;
}

/** True when a usable OAuth token file exists. */
export async function isGoogleConnected(): Promise<boolean> {
  const tokens = await readStoredTokens();
  if (!tokens?.access_token && !tokens?.refresh_token) return false;
  return scopesMissing(tokens).length === 0;
}

/** Auth URL for the Ledgerman Connect Gmail button. */
export async function getGoogleAuthUrl(state?: string): Promise<string> {
  const client = await createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    ...(state ? { state } : {}),
  });
}

/** Exchange authorization code from the UI OAuth callback. */
export async function completeGoogleOAuth(code: string): Promise<{
  email: string | null;
}> {
  const client = await createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveTokens(tokens);
  cachedAuth = client;

  let email: string | null = null;
  try {
    const gmail = google.gmail({ version: "v1", auth: client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    email = profile.data.emailAddress ?? null;
  } catch (err) {
    logger.warn("Could not read Gmail profile after OAuth", err);
  }

  return { email };
}

export async function disconnectGoogle(): Promise<void> {
  clearGoogleAuthCache();
  await fs.unlink(env.googleTokenPath).catch(() => undefined);
}

export async function getConnectedGmailEmail(): Promise<string | null> {
  try {
    const auth = await getGoogleAuth({ allowInteractive: false });
    const gmail = google.gmail({ version: "v1", auth });
    const profile = await gmail.users.getProfile({ userId: "me" });
    return profile.data.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function authorizeWithBrowser(
  client: OAuth2Client,
  redirectUri: string
): Promise<void> {
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
  });

  const redirect = new URL(redirectUri);
  const listenPort = Number(redirect.port) || 3000;
  const callbackPath = redirect.pathname || "/agent/auth/google/callback";

  console.log("\n>>> Open this URL to authorize:\n");
  console.log(authUrl);
  console.log(
    `\nIf you see redirect_uri_mismatch, add this in Cloud Console:\n  ${redirectUri}\n`
  );
  console.log(
    "Or use Connect Gmail in the Ledgerman UI while `npm run dev` is running.\n"
  );

  // CLI-only fallback: temporary listener on the redirect port.
  // Prefer HTTP callback on the main Express server when possible.
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://localhost:${listenPort}`);
        if (url.pathname !== callbackPath) {
          res.writeHead(404).end("Not found");
          return;
        }

        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400).end(`OAuth error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        const authCode = url.searchParams.get("code");
        if (!authCode) {
          res.writeHead(400).end("Missing code");
          return;
        }

        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end("<h1>Authorized</h1><p>You can close this tab and return to Ledgerman.</p>");
        server.close();
        resolve(authCode);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(listenPort, () => {
      logger.info(`Waiting for OAuth callback on port ${listenPort}`);
    });
    server.on("error", reject);
  });

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await saveTokens(tokens);
}

export async function getGoogleAuth(options?: {
  allowInteractive?: boolean;
}): Promise<OAuth2Client> {
  const allowInteractive = options?.allowInteractive ?? false;

  if (cachedAuth?.credentials?.access_token || cachedAuth?.credentials?.refresh_token) {
    return cachedAuth;
  }

  const client = await createOAuthClient();
  const tokens = await readStoredTokens();

  if (tokens) {
    const missing = scopesMissing(tokens);
    if (missing.length > 0) {
      logger.info("Token missing scopes — need re-authorize", { missing });
      await fs.unlink(env.googleTokenPath).catch(() => undefined);
    } else if (tokens.access_token || tokens.refresh_token) {
      client.setCredentials(tokens);
      cachedAuth = client;
      return client;
    }
  }

  if (!allowInteractive) {
    throw new GoogleNotConnectedError();
  }

  await authorizeWithBrowser(client, env.googleOauthRedirectUri);
  cachedAuth = client;
  return client;
}

export async function getGmailClient() {
  const auth = await getGoogleAuth({ allowInteractive: false });
  return google.gmail({ version: "v1", auth });
}

export async function getSheetsClient() {
  const auth = await getGoogleAuth({ allowInteractive: false });
  return google.sheets({ version: "v4", auth });
}
