import type { ExtractedInvoiceData } from "../types/invoice.js";
import type { GmailMessage } from "./gmail.service.js";

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function parseAmount(raw: string): { amount: number; currency: string } {
  const cleaned = raw.replace(/,/g, "").trim();
  const withCode = cleaned.match(
    /(?:(USD|EUR|GBP|INR|AUD|CAD)\s*)?([$€£₹])?\s*(\d+(?:\.\d{1,2})?)/i
  );
  if (!withCode) return { amount: 0, currency: "" };

  const code = (withCode[1] ?? "").toUpperCase();
  const symbol = withCode[2] ?? "";
  const amount = Number(withCode[3]);

  const currency =
    code ||
    ({ $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" }[symbol] ?? "");

  return { amount: Number.isFinite(amount) ? amount : 0, currency };
}

function vendorFromFromHeader(from: string): string {
  const name = from.match(/^"?([^"<]+)"?\s*</);
  if (name?.[1]) return name[1].trim();
  const email = from.match(/[\w.+-]+@([\w.-]+)/);
  if (email?.[1]) {
    const domain = email[1].split(".")[0] ?? "";
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  return from.trim();
}

function normalizeDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  const mdy = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    const month = mdy[1].padStart(2, "0");
    const day = mdy[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return value;
}

const NOISE_VENDORS = /^(slack|gmail|google|mailer-daemon|mail delivery|noreply|no-reply|notifications?)\b/i;

function looksLikeInvoiceId(value: string): boolean {
  const id = value.trim();
  if (!id || id.length < 3) return false;
  // Artifact from matching INV + "oice" inside the word "Invoice"
  if (/^oice$/i.test(id)) return false;
  if (/^invoice$/i.test(id)) return false;
  // Prefer ids that include a digit (INV-1042, #A123, etc.)
  if (/\d/.test(id)) return true;
  // Short letter codes without digits are usually false positives
  return id.length >= 6 && /[-_/]/.test(id);
}

function resolveVendor(text: string, from: string): string {
  const explicit =
    firstMatch(text, [
      /vendor\s*[:.]?\s*([^\n\r]+)/i,
      /billed\s*by\s*[:.]?\s*([^\n\r]+)/i,
      /bill\s*from\s*[:.]?\s*([^\n\r]+)/i,
      /from\s*[:.]?\s*([^\n\r,]{3,60})/i,
    ]) || vendorFromFromHeader(from);

  const cleaned = explicit.replace(/\s+/g, " ").trim();
  if (!cleaned || NOISE_VENDORS.test(cleaned)) return "";
  return cleaned.slice(0, 80);
}

/** Lightweight regex extraction from email subject/body. */
export function extractInvoiceData(message: GmailMessage): ExtractedInvoiceData {
  const text = `${message.subject}\n${message.snippet}\n${message.bodyText}`;

  const candidates = [
    firstMatch(text, [
      /invoice\s*(?:number|no\.?|#)\s*[:.]?\s*([A-Z0-9][-A-Z0-9/]{2,})/i,
      /\b(INV[-_]\d[-A-Z0-9]*)\b/i,
      // Require a delimiter after INV so "Invoice" never becomes "oice"
      /\bINV[-_#:\s]+\s*([A-Z0-9][-A-Z0-9/]{2,})/i,
      /#\s*([A-Z]{1,3}\d{3,}[-A-Z0-9]*)/i,
    ]),
  ].filter(Boolean) as string[];

  const invoiceId =
    candidates.find(looksLikeInvoiceId) ||
    (message.id ? `email-${message.id.slice(0, 10)}` : "unknown");

  const amountRaw = firstMatch(text, [
    /(?:total|amount\s*due|balance\s*due|grand\s*total|amount)\s*[:.]?\s*([A-Z$€£₹\d.,\s]+)/i,
    /([$€£₹]\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
    /((?:USD|EUR|GBP|INR)\s*\d+(?:\.\d{2})?)/i,
  ]);
  const { amount, currency } = amountRaw
    ? parseAmount(amountRaw)
    : { amount: 0, currency: "" };

  const invoiceDate =
    normalizeDate(
      firstMatch(text, [
        /invoice\s*date\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
        /\bdate\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i,
      ]) || message.date
    );

  const dueDate = normalizeDate(
    firstMatch(text, [
      /due\s*date\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
      /payable\s*by\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    ])
  );

  const vendor = resolveVendor(text, message.from);

  return {
    invoiceId,
    vendor,
    amount,
    currency: currency || "USD",
    invoiceDate,
    dueDate,
  };
}
