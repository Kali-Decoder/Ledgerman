import { Router } from "express";
import { processMockPayment } from "../services/payment.service.js";
import { updateInvoiceDecision } from "../services/sheets.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * POST /payment/mock
 * Body: { invoiceId, vendor, amount, currency, markPaid?: boolean, approvedBy?: string }
 */
router.post("/mock", async (req, res) => {
  try {
    const {
      invoiceId,
      vendor,
      amount,
      currency,
      markPaid = true,
      approvedBy = "mock-api",
    } = req.body ?? {};

    if (!invoiceId || amount === undefined) {
      res.status(400).json({
        error: "invoiceId and amount are required",
      });
      return;
    }

    const payment = await processMockPayment({
      invoiceId: String(invoiceId),
      vendor: String(vendor ?? "Unknown"),
      amount: Number(amount),
      currency: String(currency ?? "USD"),
    });

    if (payment.success && markPaid) {
      await updateInvoiceDecision({
        invoiceId: String(invoiceId),
        status: "paid",
        approvedBy: String(approvedBy),
        amount: payment.amount,
        currency: payment.currency,
        paymentId: payment.paymentIntentId,
        paymentStatus: payment.status,
        paidAt: payment.createdAt,
        paymentProvider: payment.provider,
      });
    }

    res.json({ payment });
  } catch (err) {
    logger.error("Mock payment route failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Payment failed",
    });
  }
});

export default router;
