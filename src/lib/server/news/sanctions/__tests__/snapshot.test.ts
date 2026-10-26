import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("ships one parseable sanctions fallback without OFAC missing-value sentinels", () => {
  const text = readFileSync(path.join(process.cwd(), "public/data/news-layers/sanctions-entities.json"), "utf8");
  const snapshot = JSON.parse(text);
  expect(snapshot.entities.length).toBeGreaterThan(1000);
  const ofac = snapshot.entities.filter((entity: { authority: string }) => entity.authority === "OFAC");
  expect(ofac.length).toBeGreaterThan(1000);
  expect(ofac.every((entity: { jurisdictionCountry: string; identifiers: Record<string, string> }) =>
    entity.jurisdictionCountry !== "-0-" && Object.values(entity.identifiers).every(value => value !== "-0-"))).toBe(true);
  // An organization or person must not retain the corrupted blanket vessel label.
  expect(ofac.find((entity: { name: string }) => entity.name === "BANCO NACIONAL DE CUBA")?.entityType).not.toBe("Vessel");
});
