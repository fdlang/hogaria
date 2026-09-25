export type InvoiceStatus = "draft" | "issued" | "cancelled" | "paid";
export type PaymentStatus = "pending" | "received" | "reconciled" | "reversed";

const invoiceTransitions: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  draft: ["issued", "cancelled"],
  issued: ["cancelled", "paid"],
  cancelled: [],
  paid: [],
};

const paymentTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  pending: ["received"],
  received: ["reconciled", "reversed"],
  reconciled: ["reversed"],
  reversed: [],
};

export const canTransitionInvoice = (from: InvoiceStatus, to: InvoiceStatus) =>
  from === to || invoiceTransitions[from].includes(to);

export const canTransitionPayment = (from: PaymentStatus, to: PaymentStatus) =>
  from === to || paymentTransitions[from].includes(to);
