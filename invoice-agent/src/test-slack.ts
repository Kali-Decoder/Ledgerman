/**
 * Step 3 — first Slack connection test.
 *
 *   npm run test:slack
 *
 * Invite the bot to the channel first: /invite @YourBotName
 */
import { sendSlackMessage } from "./services/slack.service.js";
import { env } from "./config/env.js";

async function main() {
  const channel = env.slackChannel || "#invoices";

  await sendSlackMessage(
    channel,
    "Invoice Automation Agent connected successfully!"
  );

  console.log(`Slack message sent to ${channel}`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
