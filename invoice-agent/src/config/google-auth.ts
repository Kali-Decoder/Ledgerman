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

/** Must match an Authorized redirect URI on the OAuth client in Cloud Console. */
export const OAUTH_REDIRECT_URI = "http://localhost:3001/oauth2callback";

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
    redirectUri: OAUTH_REDIRECT_URI,
  };
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
  const listenPort = Number(redirect.port) || 3001;
  const callbackPath = redirect.pathname || "/oauth2callback";

  console.log("\n>>> Open this URL to authorize:\n");
  console.log(authUrl);
  console.log(
    `\nIf you see redirect_uri_mismatch, add this in Cloud Console:\n  ${redirectUri}\n`
  );

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
          .end("<h1>Authorized</h1><p>You can close this tab.</p>");
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
  await fs.mkdir(path.dirname(env.googleTokenPath), { recursive: true });
  await fs.writeFile(env.googleTokenPath, JSON.stringify(tokens, null, 2));
  logger.info(`Saved token → ${env.googleTokenPath}`);
}

let cachedAuth: OAuth2Client | null = null;

export async function getGoogleAuth(): Promise<OAuth2Client> {
  if (cachedAuth?.credentials?.access_token) {
    return cachedAuth;
  }

  const { clientId, clientSecret, redirectUri } = await loadClientSecrets();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const tokenRaw = await fs.readFile(env.googleTokenPath, "utf8");
    const tokens = JSON.parse(tokenRaw) as {
      access_token?: string;
      scope?: string;
    };
    const scopes = tokens.scope?.split(" ") ?? [];
    const missing = GOOGLE_SCOPES.filter((s) => !scopes.includes(s));
    if (missing.length > 0) {
      logger.info("Token missing scopes — re-authorizing", { missing });
      await fs.unlink(env.googleTokenPath).catch(() => undefined);
    } else {
      client.setCredentials(tokens);
      cachedAuth = client;
      return client;
    }
  } catch {
    logger.info("No token yet — starting OAuth");
  }

  await authorizeWithBrowser(client, redirectUri);
  cachedAuth = client;
  return client;
}

export async function getGmailClient() {
  const auth = await getGoogleAuth();
  return google.gmail({ version: "v1", auth });
}

export async function getSheetsClient() {
  const auth = await getGoogleAuth();
  return google.sheets({ version: "v4", auth });
}
