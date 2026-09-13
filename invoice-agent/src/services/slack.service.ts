import crypto from "node:crypto";
import { WebClient, type ChatPostMessageResponse } from "@slack/web-api";
import { env } from "../config/env.js";
import type { Invoice } from "../types/invoice.js";

function getSlackClient(): WebClient {
  if (!env.slackBotToken) {
    throw new Error("SLACK_BOT_TOKEN is missing in .env");
  }
  if (env.slackBotToken.startsWith("xapp-")) {
    throw new Error(
      "SLACK_BOT_TOKEN looks like an App-Level Token (xapp-...). " +
        "Use the Bot User OAuth Token (xoxb-...) from OAuth & Permissions instead."
    );
  }
  if (!env.slackBotToken.startsWith("xoxb-")) {
    throw new Error(
      "SLACK_BOT_TOKEN should start with xoxb- (Bot User OAuth Token). " +
        "Get it from Slack app → OAuth & Permissions → Bot User OAuth Token."
    );
  }
  return new WebClient(env.slackBotToken);
}

/** Send a plain text message to a Slack channel. */
export async function sendSlackMessage(channel: string, message: string) {
  const slack = getSlackClient();
  return slack.chat.postMessage({
    channel,
    text: message,
  });
}

export type ApprovalButtonValue = {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
};

function buildApprovalBlocks(invoice: Invoice) {
  const value: ApprovalButtonValue = {
    invoiceId: invoice.invoiceId,
    vendor: invoice.vendor,
    amount: invoice.amount,
    currency: invoice.currency,
  };
  const valueJson = JSON.stringify(value);

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Invoice approval needed",
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Invoice ID:*\n${invoice.invoiceId}` },
        { type: "mrkdwn", text: `*Vendor:*\n${invoice.vendor}` },
        {
          type: "mrkdwn",
          text: `*Amount:*\n${invoice.amount} ${invoice.currency}`,
        },
        {
          type: "mrkdwn",
          text: `*Invoice Date:*\n${invoice.invoiceDate || "—"}`,
        },
        { type: "mrkdwn", text: `*Due Date:*\n${invoice.dueDate || "—"}` },
        { type: "mrkdwn", text: `*Status:*\n${invoice.status}` },
      ],
    },
    {
      type: "actions",
      block_id: "invoice_approval_actions",
      elements: [
        {
          type: "button",
          action_id: "approve_invoice",
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          value: valueJson,
        },
        {
          type: "button",
          action_id: "reject_invoice",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          value: valueJson,
        },
      ],
    },
  ];
}

/** Post Approve / Reject buttons for an invoice. */
export async function sendApprovalRequest(
  invoice: Invoice,
  channel = env.slackChannel
): Promise<ChatPostMessageResponse> {
  const slack = getSlackClient();
  const text = `Approval needed: ${invoice.invoiceId} — ${invoice.vendor} — ${invoice.amount} ${invoice.currency}`;

  return slack.chat.postMessage({
    channel,
    text,
    blocks: buildApprovalBlocks(invoice),
  });
}

export function buildDecisionBlocks(options: {
  invoiceId: string;
  decision: "approved" | "rejected";
  approvedBy: string;
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
}) {
  const { invoiceId, decision, approvedBy, paymentIntentId, amount, currency } =
    options;
  const emoji = decision === "approved" ? "✅" : "❌";

  const lines = [
    `${emoji} *Invoice \`${invoiceId}\` ${decision}* by *${approvedBy}*`,
  ];

  if (decision === "approved" && paymentIntentId) {
    lines.push(
      `💳 *Stripe payment* \`${paymentIntentId}\` — *${amount ?? ""} ${currency ?? ""}* — status \`succeeded\``
    );
  }

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: lines.join("\n"),
      },
    },
  ];
}

export async function updateApprovalMessage(options: {
  channel: string;
  ts: string;
  invoiceId: string;
  decision: "approved" | "rejected";
  approvedBy: string;
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
}) {
  const slack = getSlackClient();
  const text = options.paymentIntentId
    ? `Invoice ${options.invoiceId} ${options.decision} by ${options.approvedBy}; paid via ${options.paymentIntentId}`
    : `Invoice ${options.invoiceId} ${options.decision} by ${options.approvedBy}`;

  return slack.chat.update({
    channel: options.channel,
    ts: options.ts,
    text,
    blocks: buildDecisionBlocks(options),
  });
}

/** Verify Slack request signature (when SLACK_SIGNING_SECRET is set). */
export function verifySlackSignature(options: {
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
}): boolean {
  if (!env.slackSigningSecret) {
    // Hackathon fallback — set SLACK_SIGNING_SECRET for real verification
    return true;
  }

  const { signature, timestamp, rawBody } = options;
  if (!signature || !timestamp) return false;

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", env.slackSigningSecret)
    .update(base)
    .digest("hex");
  const expected = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

export function parseApprovalValue(raw: string): ApprovalButtonValue {
  return JSON.parse(raw) as ApprovalButtonValue;
}
