/**
 * Send a sample Approve / Reject message to Slack.
 *
 * With Socket Mode (your app setting):
 *   1. Put SLACK_APP_TOKEN=xapp-... in .env (connections:write)
 *   2. npm run dev          ← keeps Socket Mode connected
 *   3. npm run test:slack-approval
 *   4. Click Approve / Reject in #invoices
 *
 * No ngrok needed while Socket Mode is enabled.
 */
import { sendApprovalRequest } from "./services/slack.service.js";
import { appendInvoices } from "./services/sheets.service.js";
import type { Invoice } from "./types/invoice.js";
import { env } from "./config/env.js";

async function main() {
  if (!env.slackAppToken) {
    console.warn(
      "Warning: SLACK_APP_TOKEN is empty. Start npm run dev after adding xapp- token or button clicks won't be received."
    );
  }

  const sample: Invoice = {
    invoiceId: `INV-DEMO-${Date.now().toString().slice(-6)}`,
    vendor: "Acme Supplies",
    amount: 1250.5,
    currency: "USD",
    invoiceDate: "2026-09-01",
    dueDate: "2026-09-30",
    status: "pending",
    duplicate: false,
    approvedBy: "",
  };

  if (env.googleSheetsId) {
    await appendInvoices([sample]);
    console.log(`Sheet row added for ${sample.invoiceId}`);
  } else {
    console.warn(
      "GOOGLE_SHEETS_ID missing — Slack buttons will work, sheet won't update."
    );
  }

  const res = await sendApprovalRequest(sample, env.slackChannel);
  console.log(`Approval message sent to ${env.slackChannel}`);
  console.log(`invoiceId=${sample.invoiceId} ts=${res.ts}`);
  console.log("Keep `npm run dev` running, then click Approve or Reject.");
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
