import { describe, expect, it } from "vitest";
import { locationSuggestionFromFact, normalizedLocationName } from "@/lib/knowledge/location-from-fact";

describe("location suggestions from teaching", () => {
  it("only suggests reviewed location knowledge", () => {
    expect(locationSuggestionFromFact({ category: "SERVICE", proposedTitle: "فرع جليم", proposedContent: "حلاقة شعر" })).toBeNull();
    expect(locationSuggestionFromFact({ category: "LOCATION_INFO", proposedTitle: "مواعيد العمل", proposedContent: "من 12 إلى 10" })).toBeNull();
  });
  it("suggests known branch without inventing structured fields", () => {
    expect(locationSuggestionFromFact({
      category: "LOCATION_INFO", proposedTitle: "فرع جليم",
      proposedContent: "فرع جليم موجود في سابا باشا. المواعيد من 11 إلى 2.",
    })).toEqual({ name: "فرع جليم", addressLine: "", phone: "" });
  });
  it("uses explicitly labeled address and phone", () => {
    expect(locationSuggestionFromFact({
      category: "LOCATION_INFO", proposedTitle: "فرع سموحة",
      proposedContent: "العنوان: سموحة، شارع فوزي معاذ\nالهاتف: 01012345678",
    })).toEqual({ name: "فرع سموحة", addressLine: "سموحة، شارع فوزي معاذ", phone: "01012345678" });
  });
  it("normalizes common branch prefixes to reduce accidental duplicates", () => {
    expect(normalizedLocationName("فرع جليم")).toBe(normalizedLocationName("مكتب جليم"));
    expect(normalizedLocationName("مقر سموحة")).toBe(normalizedLocationName("فرع سموحة"));
  });
});
