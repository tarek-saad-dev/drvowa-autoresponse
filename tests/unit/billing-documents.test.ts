import { describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/db";
import type { ManualPaymentRequest } from "@/types/domain";
import { settlePaymentInvoice } from "@/modules/billing/documents";

const payment = { paymentRequestId: "p", businessId: "b", amount: 199.99, currencyCode: "EGP", requestedPlanCode: "PRO", requestedPlanDisplayName: "Pro" } as ManualPaymentRequest;
function client(row: Record<string, unknown>) {
  const queries: { text: string; inputs: unknown }[] = [];
  const trx = { query: vi.fn(async (text: string, inputs: unknown) => {
    queries.push({ text, inputs });
    return { recordset: text.startsWith("SELECT InvoiceID") ? [row] : [], rowsAffected: [1] };
  }), execute: vi.fn() } as unknown as TransactionClient;
  return { trx, queries };
}
describe("invoice settlement", () => {
  it("rejects mismatched amount before any settlement write", async () => {
    const { trx, queries } = client({ InvoiceID: "i", TotalMinor: 19998, CurrencyCode: "EGP", Status: "OPEN" });
    await expect(settlePaymentInvoice(payment, trx)).rejects.toThrow("لا تطابق");
    expect(queries.some(q => q.text.includes("INSERT INTO TblBillingReceipt"))).toBe(false);
  });
  it.each(["USD", "SAR"])("rejects a different invoice currency %s", async currency => {
    const { trx } = client({ TotalMinor: 19999, CurrencyCode: currency, Status: "OPEN" });
    await expect(settlePaymentInvoice(payment, trx)).rejects.toThrow();
  });
  it("does not issue another receipt for an already settled invoice", async () => {
    const { trx, queries } = client({ TotalMinor: 19999, CurrencyCode: "EGP", Status: "PAID" });
    await settlePaymentInvoice(payment, trx);
    expect(queries.some(q => q.text.includes("INSERT INTO TblBillingReceipt"))).toBe(false);
  });
  it("rejects a void invoice", async () => {
    const { trx } = client({ TotalMinor: 19999, CurrencyCode: "EGP", Status: "VOID" });
    await expect(settlePaymentInvoice(payment, trx)).rejects.toThrow();
  });
});
