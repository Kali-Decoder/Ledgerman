import {
  parseApprovalValue,
  updateApprovalMessage,
} from "./slack.service.js";
import { updateInvoiceDecision } from "./sheets.service.js";
import { processMockPayment } from "./payment.service.js";
import { logger } from "../utils/logger.js";

export type SlackInteractionPayload = {
  type?: string;
  user?: { id?: string; username?: string; name?: string };
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
};

/** Shared Approve / Reject handler (Socket Mode or HTTP). */
export async function handleApprovalInteraction(
  payload: SlackInteractionPayload
): Promise<void> {
  const action = payload.actions?.[0];
  if (!action?.action_id || !action.value) return;

  if (
    action.action_id !== "approve_invoice" &&
    action.action_id !== "reject_invoice"
  ) {
    return;
  }

  const decision =
    action.action_id === "approve_invoice" ? "approved" : "rejected";
  const value = parseApprovalValue(action.value);
  const approvedBy =
    payload.user?.username ||
    payload.user?.name ||
    payload.user?.id ||
    "unknown";

  let paymentIntentId: string | undefined;
  let paidAmount: number | undefined;
  let paidCurrency: string | undefined;

  if (decision === "rejected") {
    await updateInvoiceDecision({
      invoiceId: value.invoiceId,
      status: "rejected",
      approvedBy,
    });
  } else {
    // Mark approved first so the sheet shows the human decision immediately
    await updateInvoiceDecision({
      invoiceId: value.invoiceId,
      status: "approved",
      approvedBy,
    });

    const payment = await processMockPayment({
      invoiceId: value.invoiceId,
      vendor: value.vendor,
      amount: value.amount,
      currency: value.currency,
    });

    if (payment.success) {
      await updateInvoiceDecision({
        invoiceId: value.invoiceId,
        status: "paid",
        approvedBy,
        amount: payment.amount,
        currency: payment.currency,
        paymentId: payment.paymentIntentId,
        paymentStatus: payment.status,
        paidAt: payment.createdAt,
        paymentProvider: payment.provider,
      });
      paymentIntentId = payment.paymentIntentId;
      paidAmount = payment.amount;
      paidCurrency = payment.currency;
    } else {
      await updateInvoiceDecision({
        invoiceId: value.invoiceId,
        status: "approved",
        approvedBy,
        paymentId: payment.paymentIntentId,
        paymentStatus: payment.status,
        paidAt: payment.createdAt,
        paymentProvider: payment.provider,
      });
      logger.warn("Mock payment failed after approval", {
        invoiceId: value.invoiceId,
        payment,
      });
    }
  }

  if (payload.channel?.id && payload.message?.ts) {
    await updateApprovalMessage({
      channel: payload.channel.id,
      ts: payload.message.ts,
      invoiceId: value.invoiceId,
      decision,
      approvedBy,
      paymentIntentId,
      amount: paidAmount,
      currency: paidCurrency,
    });
  }

  logger.info("Handled Slack approval action", {
    invoiceId: value.invoiceId,
    decision,
    approvedBy,
    paymentIntentId,
  });
}
