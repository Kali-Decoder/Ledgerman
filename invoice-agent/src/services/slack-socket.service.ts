import { SocketModeClient } from "@slack/socket-mode";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import {
  handleApprovalInteraction,
  type SlackInteractionPayload,
} from "./slack-interactions.service.js";

let started = false;

/**
 * Socket Mode listener for button clicks.
 * Requires SLACK_APP_TOKEN (xapp-...) with connections:write.
 * No ngrok / Request URL needed when Socket Mode is enabled.
 */
export async function startSlackSocketMode(): Promise<void> {
  if (started) return;

  if (!env.slackAppToken) {
    logger.warn(
      "SLACK_APP_TOKEN missing — Socket Mode off. Add xapp- token from Basic Information → App-Level Tokens (scope: connections:write)."
    );
    return;
  }

  if (!env.slackAppToken.startsWith("xapp-")) {
    throw new Error("SLACK_APP_TOKEN must start with xapp-");
  }

  const client = new SocketModeClient({
    appToken: env.slackAppToken,
  });

  client.on("interactive", async ({ ack, body }) => {
    try {
      await ack();
      await handleApprovalInteraction(body as SlackInteractionPayload);
    } catch (err) {
      logger.error("Socket Mode interactive handler failed", err);
    }
  });

  await client.start();
  started = true;
  logger.info("Slack Socket Mode connected — listening for Approve/Reject");
}
