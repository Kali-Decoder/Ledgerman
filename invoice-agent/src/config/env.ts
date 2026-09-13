import "dotenv/config";

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV ?? "development",
  googleCredentialsPath:
    process.env.GOOGLE_CREDENTIALS_PATH ?? "./credentials/credentials.json",
  googleTokenPath: process.env.GOOGLE_TOKEN_PATH ?? "./credentials/token.json",
  /** Must match an Authorized redirect URI on the Google OAuth client. */
  googleOauthRedirectUri:
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    "http://localhost:3000/agent/auth/google/callback",
  /** Where to send the browser after a successful Connect Gmail. */
  uiOrigin: process.env.UI_ORIGIN ?? "http://localhost:5173",
  gmailUser: process.env.GMAIL_USER ?? "me",
  gmailQuery:
    process.env.GMAIL_QUERY ??
    "(subject:invoice OR subject:receipt OR subject:billing) newer_than:30d",
  gmailMaxResults: Number(process.env.GMAIL_MAX_RESULTS) || 20,
  googleSheetsId: process.env.GOOGLE_SHEETS_ID ?? "",
  googleSheetsTab: process.env.GOOGLE_SHEETS_TAB ?? "Sheet1",
  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
  slackAppToken: process.env.SLACK_APP_TOKEN ?? "",
  slackChannel: process.env.SLACK_CHANNEL || "#invoices",
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  mockPaymentDelayMs: Number(process.env.MOCK_PAYMENT_DELAY_MS) || 800,
};
