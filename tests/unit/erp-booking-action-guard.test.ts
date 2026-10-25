import { describe, expect, it } from "vitest";
import {
  approveBookingChange,
  type BookingCandidate,
} from "@/modules/integrations/booking-action-guard";

const bookings: BookingCandidate[] = [
  {
    code: "BK-ABCD2",
    workDate: "2026-10-25",
    time: "23:00",
    barber: { empId: 17 },
    branch: { branchCode: "GLEEM" },
    services: [{ serviceId: 9 }],
  },
  {
    code: "BK-BCDE3",
    workDate: "2026-10-25",
    time: "23:30",
    barber: { empId: 17 },
    branch: { branchCode: "GLEEM" },
    services: [{ serviceId: 9 }],
  },
];

describe("ERP booking mutation safety", () => {
  it("moves two owned bookings to Wednesday preserving each distinct time", () => {
    const result = approveBookingChange({
      action: "RESCHEDULE",
      plan: {
        confirmed: true,
        expectedCount: 2,
        bookingCodes: ["BK-ABCD2", "BK-BCDE3"],
        workDate: "2026-10-28",
        sameTime: true,
      },
      candidates: bookings,
      today: "2026-10-25",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([
      {
        action: "RESCHEDULE",
        booking: bookings[0],
        desired: {
          workDate: "2026-10-28", time: "23:00",
          empId: 17, branchCode: "GLEEM", serviceIds: [9],
        },
      },
      {
        action: "RESCHEDULE",
        booking: bookings[1],
        desired: {
          workDate: "2026-10-28", time: "23:30",
          empId: 17, branchCode: "GLEEM", serviceIds: [9],
        },
      },
    ]);
  });

  it("refuses any mutation without explicit customer approval", () => {
    expect(approveBookingChange({
      action: "CANCEL",
      plan: { confirmed: false, expectedCount: 2, bookingCodes: bookings.map((b) => b.code) },
      candidates: bookings, today: "2026-10-25",
    })).toEqual({ ok: false, reason: "NO_EXPLICIT_CUSTOMER_APPROVAL" });
  });

  it("refuses to claim both bookings if only one code is selected", () => {
    expect(approveBookingChange({
      action: "RESCHEDULE",
      plan: {
        confirmed: true, expectedCount: 2, bookingCodes: [bookings[0].code],
        workDate: "2026-10-28", sameTime: true,
      },
      candidates: bookings, today: "2026-10-25",
    })).toEqual({ ok: false, reason: "AMBIGUOUS_BOOKING_SELECTION" });
  });

  it("never modifies bookings absent from the phone-owned ERP response", () => {
    expect(approveBookingChange({
      action: "CANCEL",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: ["BK-WXYZ9"] },
      candidates: bookings, today: "2026-10-25",
    })).toEqual({ ok: false, reason: "BOOKING_NOT_OWNED_OR_NOT_UPCOMING" });
  });

  it("blocks duplicate booking codes and rejects invented dates", () => {
    const duplicated = approveBookingChange({
      action: "CANCEL",
      plan: { confirmed: true, expectedCount: 2, bookingCodes: [bookings[0].code, bookings[0].code] },
      candidates: bookings, today: "2026-10-25",
    });
    expect(duplicated.ok).toBe(false);
    const past = approveBookingChange({
      action: "RESCHEDULE",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: [bookings[0].code],
        workDate: "2026-10-20", sameTime: true },
      candidates: bookings, today: "2026-10-25",
    });
    expect(past).toEqual({ ok: false, reason: "DESIRED_DATE_OUT_OF_BOOKING_WINDOW" });
    const invalid = approveBookingChange({
      action: "RESCHEDULE",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: [bookings[0].code],
        workDate: "2026-02-30", sameTime: true },
      candidates: bookings, today: "2026-02-25",
    });
    expect(invalid).toEqual({ ok: false, reason: "INVALID_DESIRED_DATE" });
  });

  it("requires a valid explicit time if not preserving each booking's time", () => {
    const result = approveBookingChange({
      action: "RESCHEDULE",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: [bookings[0].code],
        workDate: "2026-10-28", sameTime: false, newTime: null },
      candidates: bookings, today: "2026-10-25",
    });
    expect(result).toEqual({ ok: false, reason: "TIME_REQUIRES_CONFIRMATION" });
  });

  it("refuses writes with missing authoritative branch, employee or services", () => {
    const result = approveBookingChange({
      action: "RESCHEDULE",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: [bookings[0].code],
        workDate: "2026-10-28", sameTime: true },
      candidates: [{ ...bookings[0], barber: { empId: null } }],
      today: "2026-10-25",
    });
    expect(result).toEqual({ ok: false, reason: "BOOKING_DETAILS_REQUIRE_RECEPTION" });
  });

  it("allows a confirmed cancellation for a single uniquely owned booking", () => {
    const result = approveBookingChange({
      action: "CANCEL",
      plan: { confirmed: true, expectedCount: 1, bookingCodes: [bookings[1].code] },
      candidates: bookings, today: "2026-10-25",
    });
    expect(result).toEqual({ ok: true, changes: [{ action: "CANCEL", booking: bookings[1] }] });
  });
});
