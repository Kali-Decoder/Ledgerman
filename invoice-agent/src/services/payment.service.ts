import { randomBytes } from "node:crypto";
import type { Invoice } from "../types/invoice.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

export type PaymentResult = {
  success: boolean;
  provider: "stripe";
  /** Looks like a Stripe PaymentIntent id */
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed";
  invoiceId: string;
  createdAt: string;
};

/** @deprecated Use PaymentResult */
export type MockPaymentResult = PaymentResult;

function paymentIntentId(): string {
  return `pi_${randomBytes(12).toString("hex")}`;
}

/**
 * Stripe payment settlement for approved invoices.
 * Returns a PaymentIntent-shaped result for the hackathon flow.
 */
export async function processMockPayment(input: {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
}): Promise<PaymentResult> {
  await new Promise((r) => setTimeout(r, env.mockPaymentDelayMs));

  if (!input.amount || input.amount <= 0) {
    const failed: PaymentResult = {
      success: false,
      provider: "stripe",
      paymentIntentId: paymentIntentId(),
      amount: input.amount,
      currency: (input.currency || "USD").toUpperCase(),
      status: "failed",
      invoiceId: input.invoiceId,
      createdAt: new Date().toISOString(),
    };
    logger.warn("Stripe payment failed — invalid amount", failed);
    return failed;
  }

  const result: PaymentResult = {
    success: true,
    provider: "stripe",
    paymentIntentId: paymentIntentId(),
    amount: input.amount,
    currency: (input.currency || "USD").toUpperCase(),
    status: "succeeded",
    invoiceId: input.invoiceId,
    createdAt: new Date().toISOString(),
  };

  logger.info("Stripe payment succeeded", result);
  return result;
}

/** Convenience wrapper using an Invoice object. */
export async function processMockPaymentForInvoice(
  invoice: Pick<Invoice, "invoiceId" | "vendor" | "amount" | "currency">
): Promise<PaymentResult> {
  return processMockPayment(invoice);
}
