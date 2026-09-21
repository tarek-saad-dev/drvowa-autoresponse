"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type PaymentItem = {
  paymentRequestId: string;
  paymentReference: string;
  businessName: string;
  submitterEmail: string;
  submitterName: string;
  currentPlanName: string | null;
  requestedPlanName: string;
  amount: number;
  currencyCode: string;
  payerName: string | null;
  transferReference: string | null;
  customerNote: string | null;
  status: string;
  submittedAtLabel: string;
  reviewNote: string | null;
};

function statusLabel(status: string): string {
  if (status === "PENDING") return "قيد المراجعة";
  if (status === "APPROVED") return "معتمد";
  if (status === "REJECTED") return "مرفوض";
  return status;
}

export function AdminPaymentsPanel({
  initialItems,
}: {
  initialItems: PaymentItem[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PaymentItem | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function act(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "approve") {
      const ok = window.confirm(
        `تأكيد اعتماد الدفع ${selected.paymentReference} بمبلغ ${selected.amount} ${selected.currencyCode}؟`,
      );
      if (!ok) return;
    }
    startBusy(async () => {
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/payments/${selected.paymentRequestId}`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action,
              reviewNote: reviewNote || null,
            }),
          },
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          throw new Error(mapUserFacingError(data, "تعذر تنفيذ الإجراء"));
        }
        setSelected(null);
        setReviewNote("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
      }
    });
  }

  if (initialItems.length === 0) {
    return <p className="text-sm text-slate-400">لا توجد طلبات في هذا التصفية.</p>;
  }

  return (
    <div className="space-y-5">
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-start font-medium">المرجع</th>
              <th className="px-3 py-2 text-start font-medium">النشاط</th>
              <th className="px-3 py-2 text-start font-medium">العميل</th>
              <th className="px-3 py-2 text-start font-medium">من ← إلى</th>
              <th className="px-3 py-2 text-start font-medium">المبلغ</th>
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
              <th className="px-3 py-2 text-start font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {initialItems.map((item) => (
              <tr
                key={item.paymentRequestId}
                className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                onClick={() => {
                  setSelected(item);
                  setReviewNote("");
                }}
              >
                <td className="px-3 py-2 font-mono text-amber-300">
                  {item.paymentReference}
                </td>
                <td className="px-3 py-2">{item.businessName}</td>
                <td className="px-3 py-2">
                  <div>{item.submitterName}</div>
                  <div className="text-xs text-slate-500">
                    {item.submitterEmail}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {(item.currentPlanName ?? "—") + " → " + item.requestedPlanName}
                </td>
                <td className="px-3 py-2">
                  {item.amount} {item.currencyCode}
                </td>
                <td className="px-3 py-2">{statusLabel(item.status)}</td>
                <td className="px-3 py-2">{item.submittedAtLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">مراجعة الدفع</h3>
                <p className="mt-1 font-mono text-amber-300">
                  {selected.paymentReference}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                إغلاق
              </Button>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="text-slate-400">النشاط</dt>
                <dd>{selected.businessName}</dd>
              </div>
              <div>
                <dt className="text-slate-400">صاحب الحساب</dt>
                <dd>
                  {selected.submitterName} ({selected.submitterEmail})
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">الخطة الحالية</dt>
                <dd>{selected.currentPlanName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">الخطة المطلوبة</dt>
                <dd>{selected.requestedPlanName}</dd>
              </div>
              <div>
                <dt className="text-slate-400">المبلغ المتوقع</dt>
                <dd>
                  {selected.amount} {selected.currencyCode}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">اسم المحوّل</dt>
                <dd>{selected.payerName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">مرجع التحويل</dt>
                <dd>{selected.transferReference ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">ملاحظة العميل</dt>
                <dd>{selected.customerNote ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">وقت الإرسال</dt>
                <dd>{selected.submittedAtLabel}</dd>
              </div>
            </dl>

            {selected.status === "PENDING" ? (
              <div className="mt-5 space-y-3">
                <p className="text-xs text-slate-400">
                  تحقق يدوياً من حساب InstaPay خارج DRVOWA قبل الاعتماد.
                </p>
                <label className="block text-sm">
                  سبب للعميل (اختياري عند الرفض)
                  <textarea
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    rows={3}
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    maxLength={1000}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => act("approve")}>
                    اعتماد الدفع
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => act("reject")}
                  >
                    رفض الدفع
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                الحالة: {statusLabel(selected.status)}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
