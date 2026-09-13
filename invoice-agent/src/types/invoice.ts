export type InvoiceStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paid"
  | "duplicate";

export interface Invoice {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  duplicate: boolean;
  approvedBy: string;
  sourceEmailId?: string;
  paymentId?: string;
  paymentStatus?: string;
  paidAt?: string;
  paymentProvider?: string;
}

export interface ExtractedInvoiceData {
  invoiceId: string;
  vendor: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
}

export type InvoiceDecisionUpdate = {
  invoiceId: string;
  status: "approved" | "rejected" | "paid";
  approvedBy: string;
  /** When paying, refresh amount/currency from the payment result */
  amount?: number;
  currency?: string;
  paymentId?: string;
  paymentStatus?: string;
  paidAt?: string;
  paymentProvider?: string;
};
