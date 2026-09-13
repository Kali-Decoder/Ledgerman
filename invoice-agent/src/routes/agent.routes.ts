import { Router } from "express";
import { readEmails } from "../services/gmail.service.js";
import { extractInvoiceData } from "../services/extraction.service.js";
import {
  appendInvoices,
  listInvoices,
} from "../services/sheets.service.js";
import { sendApprovalRequest, sendSlackMessage } from "../services/slack.service.js";
import { processMockPayment } from "../services/payment.service.js";
import { updateInvoiceDecision } from "../services/sheets.service.js";
import { env } from "../config/env.js";
import {
  completeGoogleOAuth,
  disconnectGoogle,
  getConnectedGmailEmail,
  getGoogleAuthUrl,
  GoogleNotConnectedError,
  isGoogleConnected,
} from "../config/google-auth.js";
import { logger } from "../utils/logger.js";
import type { Invoice } from "../types/invoice.js";

const router = Router();

function uiRedirect(pathQuery: string): string {
  const base = env.uiOrigin.replace(/\/$/, "");
  return `${base}${pathQuery.startsWith("/") ? pathQuery : `/${pathQuery}`}`;
}

/** GET /agent/status — integration readiness for the launch UI. */
router.get("/status", async (_req, res) => {
  const gmailConnected = await isGoogleConnected();
  let gmailEmail: string | null = null;
  if (gmailConnected) {
    gmailEmail = await getConnectedGmailEmail();
  }

  res.json({
    ok: true,
    gmail: gmailConnected,
    gmailEmail,
    sheets: Boolean(env.googleSheetsId),
    slack: Boolean(env.slackBotToken),
    socketMode: Boolean(env.slackAppToken),
    channel: env.slackChannel,
    spreadsheetId: env.googleSheetsId || null,
    authUrl: "/agent/auth/google",
  });
});

/**
 * GET /agent/auth/google — start Gmail OAuth (redirect to Google).
 * Use from Ledgerman: Connect Gmail.
 */
router.get("/auth/google", async (req, res) => {
  try {
    const next =
      typeof req.query.next === "string" && req.query.next.startsWith("/")
        ? req.query.next
        : "/demo";
    const state = Buffer.from(JSON.stringify({ next }), "utf8").toString(
      "base64url"
    );
    const url = await getGoogleAuthUrl(state);
    res.redirect(url);
  } catch (err) {
    logger.error("auth google start failed", err);
    res.redirect(
      uiRedirect(
        `/demo?gmail=error&message=${encodeURIComponent(
          err instanceof Error ? err.message : "Connect Gmail failed"
        )}`
      )
    );
  }
});

/**
 * GET /agent/auth/google/callback — Google redirects here after consent.
 * Saves token, then sends the browser back to Ledgerman.
 */
router.get("/auth/google/callback", async (req, res) => {
  try {
    const error = typeof req.query.error === "string" ? req.query.error : "";
    if (error) {
      res.redirect(
        uiRedirect(`/demo?gmail=error&message=${encodeURIComponent(error)}`)
      );
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      res.status(400).send("Missing OAuth code");
      return;
    }

    let next = "/demo";
    if (typeof req.query.state === "string" && req.query.state) {
      try {
        const parsed = JSON.parse(
          Buffer.from(req.query.state, "base64url").toString("utf8")
        ) as { next?: string };
        if (parsed.next?.startsWith("/")) next = parsed.next;
      } catch {
        /* ignore bad state */
      }
    }

    const { email } = await completeGoogleOAuth(code);
    const qs = new URLSearchParams({
      gmail: "connected",
      ...(email ? { email } : {}),
    });
    const sep = next.includes("?") ? "&" : "?";
    res.redirect(uiRedirect(`${next}${sep}${qs.toString()}`));
  } catch (err) {
    logger.error("auth google callback failed", err);
    res.redirect(
      uiRedirect(
        `/demo?gmail=error&message=${encodeURIComponent(
          err instanceof Error ? err.message : "OAuth callback failed"
        )}`
      )
    );
  }
});

/** POST /agent/auth/google/disconnect — clear stored Google token. */
router.post("/auth/google/disconnect", async (_req, res) => {
  try {
    await disconnectGoogle();
    res.json({ ok: true, gmail: false });
  } catch (err) {
    logger.error("disconnect google failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Disconnect failed",
    });
  }
});

/** GET /agent/invoices — rows from Google Sheets. */
router.get("/invoices", async (_req, res) => {
  try {
    const invoices = await listInvoices();
    res.json({ count: invoices.length, invoices });
  } catch (err) {
    logger.error("list invoices failed", err);
    const message =
      err instanceof GoogleNotConnectedError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to list invoices";
    res.status(err instanceof GoogleNotConnectedError ? 401 : 500).json({
      error: message,
    });
  }
});

/** POST /agent/track — Gmail → extract → Sheets. */
router.post("/track", async (req, res) => {
  try {
    if (!(await isGoogleConnected())) {
      res.status(401).json({
        error: "Gmail is not connected. Use Connect Gmail first.",
        authUrl: "/agent/auth/google",
      });
      return;
    }

    const query = typeof req.body?.query === "string" ? req.body.query : undefined;
    const maxResults =
      typeof req.body?.maxResults === "number" ? req.body.maxResults : undefined;

    const messages = await readEmails({ query, maxResults });
    const invoices: Invoice[] = messages.map((message) => {
      const extracted = extractInvoiceData(message);
      return {
        ...extracted,
        status: "pending",
        duplicate: false,
        approvedBy: "",
        sourceEmailId: message.id,
      };
    });

    const result =
      invoices.length > 0
        ? await appendInvoices(invoices)
        : { added: 0, duplicates: 0, total: (await listInvoices()).length };

    res.json({
      matched: messages.length,
      ...result,
      invoices,
    });
  } catch (err) {
    logger.error("track failed", err);
    const status = err instanceof GoogleNotConnectedError ? 401 : 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : "Track failed",
      ...(err instanceof GoogleNotConnectedError
        ? { authUrl: "/agent/auth/google" }
        : {}),
    });
  }
});

/** POST /agent/approval — send Slack Approve/Reject for an invoice. */
router.post("/approval", async (req, res) => {
  try {
    const invoiceId = String(req.body?.invoiceId ?? "");
    if (!invoiceId) {
      res.status(400).json({ error: "invoiceId is required" });
      return;
    }

    const invoices = await listInvoices();
    let invoice = invoices.find((i) => i.invoiceId === invoiceId);

    if (!invoice && req.body?.invoice) {
      invoice = req.body.invoice as Invoice;
    }

    if (!invoice) {
      res.status(404).json({ error: "Invoice not found in sheet" });
      return;
    }

    const posted = await sendApprovalRequest(invoice, env.slackChannel);
    res.json({
      ok: true,
      channel: posted.channel,
      ts: posted.ts,
      invoiceId: invoice.invoiceId,
    });
  } catch (err) {
    logger.error("approval send failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Approval send failed",
    });
  }
});

/** POST /agent/ping-slack — plain connection test. */
router.post("/ping-slack", async (_req, res) => {
  try {
    await sendSlackMessage(
      env.slackChannel,
      "Invoice Automation Agent connected successfully!"
    );
    res.json({ ok: true, channel: env.slackChannel });
  } catch (err) {
    logger.error("slack ping failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Slack ping failed",
    });
  }
});

/**
 * POST /agent/pay — Stripe-shaped payment for an invoice id and update the sheet.
 */
router.post("/pay", async (req, res) => {
  try {
    const invoiceId = String(req.body?.invoiceId ?? "");
    if (!invoiceId) {
      res.status(400).json({ error: "invoiceId is required" });
      return;
    }

    const invoices = await listInvoices();
    const invoice = invoices.find((i) => i.invoiceId === invoiceId);
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }

    const payment = await processMockPayment({
      invoiceId: invoice.invoiceId,
      vendor: invoice.vendor,
      amount: invoice.amount,
      currency: invoice.currency,
    });

    if (payment.success) {
      await updateInvoiceDecision({
        invoiceId: invoice.invoiceId,
        status: "paid",
        approvedBy: invoice.approvedBy || "console",
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
    logger.error("pay failed", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Pay failed",
    });
  }
});

export default router;
