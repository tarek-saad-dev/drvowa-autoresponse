/** Pure safety gate between AI selection and customer-authorized ERP mutations. */
export type BookingCandidate = {
  code: string;
  workDate: string | null;
  time: string | null;
  branch: { branchCode: string } | null;
  barber: { empId: number | null } | null;
  services: Array<{ serviceId: number }>;
};

export type BookingActionPlan = {
  confirmed: boolean;
  expectedCount: number;
  bookingCodes: string[];
  workDate?: string | null;
  sameTime?: boolean;
  newTime?: string | null;
};

export type ApprovedBookingChange =
  | { action: "CANCEL"; booking: BookingCandidate }
  | { action: "RESCHEDULE"; booking: BookingCandidate; desired: {
      workDate: string; time: string; empId: number; branchCode: string;
      serviceIds: number[];
    } };

export type BookingChangeApproval =
  | { ok: true; changes: ApprovedBookingChange[] }
  | { ok: false; reason: string };

function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T12:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Never accept booking codes, phones, barber IDs, branches or services directly
 * from a language model. All write targets and their immutable details must
 * come from a successful phone-scoped ERP lookup.
 */
export function approveBookingChange(args: {
  action: "CANCEL" | "RESCHEDULE";
  plan: BookingActionPlan;
  candidates: BookingCandidate[];
  today: string;
}): BookingChangeApproval {
  const { action, plan, candidates, today } = args;
  if (!plan.confirmed) return { ok: false, reason: "NO_EXPLICIT_CUSTOMER_APPROVAL" };
  if (!Number.isInteger(plan.expectedCount) || plan.expectedCount < 1 || plan.expectedCount > 3) {
    return { ok: false, reason: "AMBIGUOUS_BOOKING_COUNT" };
  }

  const codes = plan.bookingCodes.map((code) => code.trim().toUpperCase());
  if (codes.length !== plan.expectedCount || new Set(codes).size !== codes.length) {
    return { ok: false, reason: "AMBIGUOUS_BOOKING_SELECTION" };
  }
  const index = new Map(candidates.map((booking) => [booking.code.toUpperCase(), booking]));
  if (index.size !== candidates.length) {
    return { ok: false, reason: "DUPLICATE_BOOKING_DATA" };
  }
  const selected = codes.map((code) => index.get(code));
  if (selected.some((booking) => !booking)) {
    return { ok: false, reason: "BOOKING_NOT_OWNED_OR_NOT_UPCOMING" };
  }

  if (action === "CANCEL") {
    return { ok: true, changes: selected.map((booking) => ({
      action, booking: booking!,
    })) };
  }

  const workDate = plan.workDate?.trim() ?? "";
  if (!isValidYmd(workDate) || !isValidYmd(today)) {
    return { ok: false, reason: "INVALID_DESIRED_DATE" };
  }
  const daysAhead = (Date.parse(workDate + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000;
  if (daysAhead < 0 || daysAhead > 14) {
    return { ok: false, reason: "DESIRED_DATE_OUT_OF_BOOKING_WINDOW" };
  }
  if (!plan.sameTime && !isValidTime(plan.newTime ?? "")) {
    return { ok: false, reason: "TIME_REQUIRES_CONFIRMATION" };
  }

  const changes: ApprovedBookingChange[] = [];
  for (const booking of selected) {
    const empId = booking?.barber?.empId;
    const branchCode = booking?.branch?.branchCode;
    const serviceIds = booking?.services?.map((item) => item.serviceId) ?? [];
    const time = plan.sameTime ? booking?.time : plan.newTime;
    if (!booking || !Number.isInteger(empId) || (empId ?? 0) <= 0 ||
      !branchCode || !serviceIds.length || serviceIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      !time || !isValidTime(time)) {
      return { ok: false, reason: "BOOKING_DETAILS_REQUIRE_RECEPTION" };
    }
    changes.push({
      action: "RESCHEDULE",
      booking,
      desired: { workDate, time, empId: empId!, branchCode, serviceIds },
    });
  }
  return { ok: true, changes };
}
