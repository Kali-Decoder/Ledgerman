import type { Invoice } from "../types/invoice.js";

export type RuleResult = {
  passed: boolean;
  reason?: string;
  requiresApproval: boolean;
};

/** Stub — rules come after milestone 1. */
export function evaluateInvoice(_invoice: Invoice): RuleResult {
  return { passed: true, requiresApproval: true };
}
