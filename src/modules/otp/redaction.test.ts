import { describe, expect, it } from "vitest";
import { redactMirroredOtp } from "./redaction";

const text = "رمز التحقق الخاص بك في CUT CLUB: *123456*\nصالح لمدة 5 دقائق. لا تشارك الرمز مع أي شخص.\nإذا لم تطلب الرمز، تجاهل هذه الرسالة.";

describe("OTP mirror redaction", () => {
  it("hides generated OTP from mirrored outbound message", () => {
    const result = redactMirroredOtp({ direction: "OUTBOUND", text });
    expect(result).not.toContain("123456");
    expect(result).toContain("تم إخفاء الرمز");
  });
  it("does not alter customer inbound or unrelated outbound messages", () => {
    expect(redactMirroredOtp({ direction: "INBOUND", text })).toBe(text);
    expect(redactMirroredOtp({ direction: "OUTBOUND", text: "موعدك الساعة 5" })).toBe("موعدك الساعة 5");
  });
});
