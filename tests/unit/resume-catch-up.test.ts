import { describe, expect, it } from "vitest";
import {
  selectPendingCustomerTail,
  type CatchUpMessage,
} from "@/modules/ai/resume-catch-up";

const at = new Date("2026-10-12T17:00:00.000Z");
function inbound(id: string, text = "Question"): CatchUpMessage {
  return {
    messageId: id,
    direction: "INBOUND",
    contentType: "TEXT",
    textContent: text,
    receivedAtUtc: at,
  };
}
function outbound(id = "reply"): CatchUpMessage {
  return {
    messageId: id,
    direction: "OUTBOUND",
    contentType: "TEXT",
    textContent: "Done",
    receivedAtUtc: at,
  };
}

describe("manual resume pending customer tail", () => {
  it("combines consecutive customer questions into one trigger", () => {
    expect(selectPendingCustomerTail([
      inbound("latest", "والمواعيد؟"),
      inbound("first", "أقرب فرع؟"),
      outbound(),
      inbound("already-answered"),
    ])).toEqual({
      triggerMessageId: "latest",
      receivedAtUtc: at,
      pendingCount: 2,
    });
  });

  it("does nothing when the last message is an employee or AI reply", () => {
    expect(selectPendingCustomerTail([outbound(), inbound("old")])).toBeNull();
    expect(selectPendingCustomerTail([])).toBeNull();
  });

  it("does not answer already replied-to questions", () => {
    expect(selectPendingCustomerTail([
      inbound("new"),
      outbound(),
      inbound("old"),
    ])?.pendingCount).toBe(1);
  });

  it("does not skip ambiguous media in the pending customer segment", () => {
    const photo: CatchUpMessage = { ...inbound("photo"), contentType: "IMAGE" };
    expect(selectPendingCustomerTail([photo, inbound("old")])).toBeNull();
    expect(selectPendingCustomerTail([inbound("new"), photo])).toBeNull();
  });

  it("does not schedule empty text or messages with unknown provenance", () => {
    expect(selectPendingCustomerTail([inbound("blank", "   ")])).toBeNull();
    expect(selectPendingCustomerTail([
      { ...inbound("unknown"), direction: "UNKNOWN" },
    ])).toBeNull();
  });
});
