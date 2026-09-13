import type { Invoice } from "../types/invoice.js";

/** Check whether an invoice looks like a duplicate. */
export async function isDuplicate(_invoice: Invoice): Promise<boolean> {
  throw new Error("Not implemented");
}
