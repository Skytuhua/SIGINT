import { expect, it } from "vitest";
import { normalizeCountryCode } from "../countryCode";
it.each(["CH", "IS", "RS"])("preserves the ISO country code %s", iso => { expect(normalizeCountryCode(iso)).toBe(iso); });
