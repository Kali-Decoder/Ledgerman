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
 * GET /agent/auth/setup — shows the exact redirect URI Google must allow.
 */
router.get("/auth/setup", (_req, res) => {
  const redirectUri = env.googleOauthRedirectUri;
  const origins = [
    `http://localhost:${env.port}`,
    env.uiOrigin.replace(/\/$/, ""),
  ];
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ledgerman · Fix redirect_uri_mismatch</title>
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #111; }
    code, pre { background: #f4f4f1; padding: 2px 6px; border-radius: 4px; }
    pre { padding: 12px; overflow: auto; }
    .box { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .warn { background: #fff6e8; border-color: #e6c98a; }
    a.button { display: inline-block; margin: 8px 8px 0 0; padding: 10px 14px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Fix Google Error 400: redirect_uri_mismatch</h1>
  <p>Ledgerman is requesting this callback. It must appear <strong>exactly</strong> under
  <strong>Authorized redirect URIs</strong> (not JavaScript origins) on your OAuth client.</p>

  <div class="box warn">
    <strong>Copy this URI:</strong>
    <pre id="uri">${redirectUri}</pre>
    <button type="button" onclick="navigator.clipboard.writeText('${redirectUri}')">Copy</button>
  </div>

  <ol>
    <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud → Credentials</a></li>
    <li>Click the OAuth client whose Client ID ends with <code>pp0ci</code> (or matches your <code>credentials.json</code>)</li>
    <li>Confirm Application type is <strong>Web application</strong></li>
    <li>Under <strong>Authorized redirect URIs</strong> → <strong>Add URI</strong> → paste the URI above</li>
    <li>Optional under <strong>Authorized JavaScript origins</strong>, add:
      <pre>${origins.join("\n")}</pre>
    </li>
    <li>Click <strong>Save</strong>, wait 1–2 minutes, then try again</li>
  </ol>

  <div class="box">
    <p>Also add the CLI fallback URI if you use terminal scripts:</p>
    <pre>http://localhost:3001/oauth2callback</pre>
  </div>

  <p>
    <a class="button" href="/agent/auth/google?next=/demo">Try Connect Gmail again</a>
    <a class="button" href="${env.uiOrigin.replace(/\/$/, "")}/demo">Back to Ledgerman</a>
  </p>
</body>
</html>`);
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
    logger.info("Starting Google OAuth", {
      redirectUri: env.googleOauthRedirectUri,
    });
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
