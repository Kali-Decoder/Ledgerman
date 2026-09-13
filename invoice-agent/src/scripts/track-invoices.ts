/**
 * Track invoice emails from Gmail → extract fields → append to Google Sheets.
 *
 *   npm run track:invoices
 *
 * Sheet columns:
 * Invoice ID | Vendor | Amount | Currency | Invoice Date | Due Date | Status | Duplicate | Approved By
 */
import { readEmails } from "../services/gmail.service.js";
import { extractInvoiceData } from "../services/extraction.service.js";
import { appendInvoices } from "../services/sheets.service.js";
import { env } from "../config/env.js";
import { getGoogleAuth } from "../config/google-auth.js";
import type { Invoice } from "../types/invoice.js";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main() {
  if (!env.googleSheetsId) {
    console.error(
      "Set GOOGLE_SHEETS_ID in .env first.\n" +
        "Create a sheet, copy the ID from:\n" +
        "https://docs.google.com/spreadsheets/d/<THIS_ID>/edit"
    );
    process.exit(1);
  }

  await getGoogleAuth({ allowInteractive: true });
  const query = argValue("--query");
  const maxRaw = argValue("--max");
  const maxResults = maxRaw ? Number(maxRaw) : undefined;

  const messages = await readEmails({ query, maxResults });

  if (messages.length === 0) {
    console.log("No invoice emails matched.");
    console.log(
      `Query was: ${query ?? env.gmailQuery}\n` +
        "Email yourself with subject 'invoice', or widen the query."
    );
    return;
  }

  const invoices: Invoice[] = messages.map((message) => {
    const extracted = extractInvoiceData(message);
    const invoice: Invoice = {
      ...extracted,
      status: "pending",
      duplicate: false,
      approvedBy: "",
      sourceEmailId: message.id,
    };

    console.log("─".repeat(60));
    console.log(`Invoice ID:   ${invoice.invoiceId}`);
    console.log(`Vendor:       ${invoice.vendor}`);
    console.log(`Amount:       ${invoice.amount} ${invoice.currency}`);
    console.log(`Invoice Date: ${invoice.invoiceDate}`);
    console.log(`Due Date:     ${invoice.dueDate || "(none)"}`);
    console.log(`Email:        ${message.subject}`);

    return invoice;
  });

  const result = await appendInvoices(invoices);

  console.log("─".repeat(60));
  console.log(`Matched emails: ${messages.length}`);
  console.log(`Rows added:     ${result.added}`);
  console.log(`Duplicates:     ${result.duplicates}`);
  console.log(`Unique IDs:     ${result.total}`);
  console.log(
    `Sheet: https://docs.google.com/spreadsheets/d/${env.googleSheetsId}/edit`
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Failed:", message);
  if (/insufficient|ACCESS_TOKEN_SCOPE|invalid_grant|403/i.test(message)) {
    console.error(
      "\nTip: delete credentials/token.json and run again to re-authorize with Sheets access."
    );
  }
  process.exit(1);
});
