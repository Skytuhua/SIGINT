import { describe, expect, it } from "vitest";
import { isValidUcdpYearRange } from "../yearRange";

describe("UCDP year query validation", () => {
  it.each(["fromYear", "toYear"])("validates %s independently", (key) => {
    for (const value of ["", "1988", "2027", "2024x", "2024.5", " 2024", "NaN"]) {
      expect(isValidUcdpYearRange(new URLSearchParams({ [key]: value }), 2026)).toBe(false);
    }
  });

  it("rejects explicitly reversed ranges", () => {
    expect(isValidUcdpYearRange(new URLSearchParams({ fromYear: "2024", toYear: "2023" }), 2026)).toBe(false);
  });

  it.each(["", "fromYear=1989", "toYear=2026", "fromYear=1989&toYear=2026", "fromYear=2024&toYear=2024"])("accepts supported filters: %s", (query) => {
    expect(isValidUcdpYearRange(new URLSearchParams(query), 2026)).toBe(true);
  });

  it("rejects a year outside the supported calendar range", () => {
    expect(isValidUcdpYearRange(new URLSearchParams({ fromYear: "1988" }), 2026)).toBe(false);
  });
});
