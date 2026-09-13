import { getSheetsClient } from "../config/google-auth.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { Invoice, InvoiceDecisionUpdate } from "../types/invoice.js";

/** Exact columns for the Invoice Tracker sheet. */
export const SHEET_HEADERS = [
  "Invoice ID",
  "Vendor",
  "Amount",
  "Currency",
  "Invoice Date",
  "Due Date",
  "Status",
  "Duplicate",
  "Approved By",
  "Payment ID",
  "Payment Status",
  "Paid At",
  "Payment Provider",
] as const;

const LAST_COL = "M"; // A..M = 13 columns

function sheetTab(): string {
  return env.googleSheetsTab || "Sheet1";
}

function requireSpreadsheetId(): string {
  if (!env.googleSheetsId) {
    throw new Error(
      "Missing GOOGLE_SHEETS_ID in .env. Create a Google Sheet, copy the ID from its URL, and set it."
    );
  }
  return env.googleSheetsId;
}

function toRow(invoice: Invoice): string[] {
  return [
    invoice.invoiceId,
    invoice.vendor,
    invoice.amount ? String(invoice.amount) : "",
    invoice.currency,
    invoice.invoiceDate,
    invoice.dueDate,
    invoice.status,
    invoice.duplicate ? "YES" : "NO",
    invoice.approvedBy,
    invoice.paymentId ?? "",
    invoice.paymentStatus ?? "",
    invoice.paidAt ?? "",
    invoice.paymentProvider ?? "",
  ];
}

/** Ensure header row matches the invoice schema. */
export async function ensureInvoiceSheetHeaders(): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTab()}!A1:${LAST_COL}1`,
  });

  const row = existing.data.values?.[0] ?? [];
  const matches = SHEET_HEADERS.every((h, i) => row[i] === h);
  if (matches) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTab()}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [Array.from(SHEET_HEADERS)] },
  });

  logger.info("Wrote Google Sheets header row", { headers: SHEET_HEADERS });
}

/** Existing Invoice IDs from column A (skip header). */
export async function getTrackedInvoiceIds(): Promise<Set<string>> {
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTab()}!A2:A`,
  });

  const ids = new Set<string>();
  for (const row of res.data.values ?? []) {
    const id = row[0]?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function findInvoiceRow(invoiceId: string): Promise<{
  sheetRow: number;
  row: string[];
} | null> {
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();
  const tab = sheetTab();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A2:${LAST_COL}`,
  });

  const values = res.data.values ?? [];
  const rowIndex = values.findIndex((r) => r[0]?.trim() === invoiceId);
  if (rowIndex === -1) return null;

  return {
    sheetRow: rowIndex + 2,
    row: values[rowIndex] ?? [],
  };
}

/**
 * Append invoice rows. If Invoice ID already exists, still append with Duplicate=YES.
 */
export async function appendInvoices(
  invoices: Invoice[]
): Promise<{ added: number; duplicates: number; total: number }> {
  await ensureInvoiceSheetHeaders();

  const existingIds = await getTrackedInvoiceIds();
  const rows: string[][] = [];
  let duplicates = 0;

  for (const invoice of invoices) {
    const isDup = existingIds.has(invoice.invoiceId);
    if (isDup) {
      duplicates += 1;
      rows.push(
        toRow({
          ...invoice,
          duplicate: true,
          status: "duplicate",
        })
      );
    } else {
      rows.push(toRow({ ...invoice, duplicate: false }));
      existingIds.add(invoice.invoiceId);
    }
  }

  if (rows.length > 0) {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: requireSpreadsheetId(),
      range: `${sheetTab()}!A:${LAST_COL}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
  }

  logger.info("Updated Google Sheets", {
    spreadsheetId: requireSpreadsheetId(),
    added: rows.length,
    duplicates,
    total: existingIds.size,
  });

  return {
    added: rows.length,
    duplicates,
    total: existingIds.size,
  };
}

/**
 * Update decision + payment columns for the first matching Invoice ID.
 * Writes Status, Approved By, Payment ID, Payment Status, Paid At, Provider,
 * and optionally Amount / Currency from the payment result.
 */
export async function updateInvoiceDecision(
  update: InvoiceDecisionUpdate
): Promise<boolean> {
  await ensureInvoiceSheetHeaders();

  const found = await findInvoiceRow(update.invoiceId);
  if (!found) {
    logger.warn("Invoice ID not found in sheet", {
      invoiceId: update.invoiceId,
    });
    return false;
  }

  const { sheetRow, row } = found;
  const sheets = await getSheetsClient();
  const spreadsheetId = requireSpreadsheetId();
  const tab = sheetTab();

  const amount =
    update.amount !== undefined ? String(update.amount) : (row[2] ?? "");
  const currency = update.currency ?? row[3] ?? "";
  const duplicate = row[7] ?? "NO";

  // C:D Amount/Currency, G:M Status → Payment Provider
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        {
          range: `${tab}!C${sheetRow}:D${sheetRow}`,
          values: [[amount, currency]],
        },
        {
          range: `${tab}!G${sheetRow}:${LAST_COL}${sheetRow}`,
          values: [
            [
              update.status,
              duplicate,
              update.approvedBy,
              update.paymentId ?? row[9] ?? "",
              update.paymentStatus ?? row[10] ?? "",
              update.paidAt ?? row[11] ?? "",
              update.paymentProvider ?? row[12] ?? "",
            ],
          ],
        },
      ],
    },
  });

  logger.info("Updated invoice decision in Sheets", {
    invoiceId: update.invoiceId,
    status: update.status,
    approvedBy: update.approvedBy,
    paymentId: update.paymentId,
    paymentStatus: update.paymentStatus,
    paidAt: update.paidAt,
    paymentProvider: update.paymentProvider,
    amount: update.amount,
    currency: update.currency,
    sheetRow,
  });

  return true;
}

/** Read all invoice rows from the sheet (for the launch console). */
export async function listInvoices(): Promise<Invoice[]> {
  await ensureInvoiceSheetHeaders();

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: requireSpreadsheetId(),
    range: `${sheetTab()}!A2:${LAST_COL}`,
  });

  const values = res.data.values ?? [];
  return values
    .filter((row) => row[0]?.trim())
    .map((row) => ({
      invoiceId: row[0]?.trim() ?? "",
      vendor: row[1] ?? "",
      amount: Number(row[2] || 0),
      currency: row[3] ?? "",
      invoiceDate: row[4] ?? "",
      dueDate: row[5] ?? "",
      status: (row[6] as Invoice["status"]) || "pending",
      duplicate: (row[7] ?? "NO").toUpperCase() === "YES",
      approvedBy: row[8] ?? "",
      paymentId: row[9] ?? "",
      paymentStatus: row[10] ?? "",
      paidAt: row[11] ?? "",
      paymentProvider: row[12] ?? "",
    }));
}
