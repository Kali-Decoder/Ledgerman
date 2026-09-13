import { Router } from "express";
import { verifySlackSignature } from "../services/slack.service.js";
import {
  handleApprovalInteraction,
  type SlackInteractionPayload,
} from "../services/slack-interactions.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * Optional HTTP fallback if Socket Mode is turned off later.
 * With Socket Mode enabled, button clicks arrive over the WebSocket instead.
 */
router.post("/interactions", async (req, res) => {
  try {
    const rawBody =
      typeof (req as { rawBody?: Buffer }).rawBody === "object"
        ? ((req as { rawBody?: Buffer }).rawBody?.toString("utf8") ?? "")
        : "";

    const ok = verifySlackSignature({
      signature: req.header("x-slack-signature") ?? undefined,
      timestamp: req.header("x-slack-request-timestamp") ?? undefined,
      rawBody:
        rawBody ||
        new URLSearchParams(req.body as Record<string, string>).toString(),
    });

    if (!ok) {
      res.status(401).send("Invalid Slack signature");
      return;
    }

    const payloadRaw =
      typeof req.body?.payload === "string" ? req.body.payload : null;
    if (!payloadRaw) {
      res.status(400).send("Missing payload");
      return;
    }

    res.status(200).send();

    const payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
    await handleApprovalInteraction(payload);
  } catch (err) {
    logger.error("Slack HTTP interactions handler failed", err);
    if (!res.headersSent) res.status(500).send("Error");
  }
});

export default router;
