import type { Invoice } from "../types/invoice.js";

/** Orchestrate extract → dedupe → rules → approval / payment. */
export async function processInvoice(_raw: unknown): Promise<Invoice> {
  throw new Error("Not implemented");
}
