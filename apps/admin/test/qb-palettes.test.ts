import { describe, it, expect } from "vitest";
import { mixHex, applyPalette, QB_PALETTES } from "../app/lib/qb-palettes";

describe("mixHex", () => {
  it("mixes toward white by pct", () => {
    expect(mixHex("#000000", 50)).toBe("#808080");
    expect(mixHex("#000000", 0)).toBe("#000000");
    expect(mixHex("#7b1e2a", 100)).toBe("#ffffff");
    expect(mixHex("#ffffff", 50)).toBe("#ffffff");
  });
  it("returns the input on malformed hex", () => {
    expect(mixHex("nope", 50)).toBe("nope");
  });
});
describe("applyPalette", () => {
  it("returns coordinated color fields with the accent as primary", () => {
    const p = applyPalette("#2563eb");
    expect(p.primaryColor).toBe("#2563eb");
    expect(p.cardsBg).toBe("#ffffff");
    expect(p.selectedBg).toBe("#ffffff");
    expect(p.tierBg).toBe(mixHex("#2563eb", 90));
    expect(p.borderColor).toBe(mixHex("#2563eb", 70));
    expect(p.labelText).toBe("#2563eb");
    expect(p.labelBg).toBe(mixHex("#2563eb", 82));
    expect(p.subtitleColor).toBe("#6b7280");
  });
  it("does not include layout/font keys", () => {
    const p = applyPalette("#2563eb") as Record<string, unknown>;
    expect(p.layoutVariant).toBeUndefined();
    expect(p.gridColumns).toBeUndefined();
    expect(p.borderRadius).toBeUndefined();
  });
});
describe("QB_PALETTES", () => {
  it("has ~12 distinct valid accents", () => {
    expect(QB_PALETTES.length).toBeGreaterThanOrEqual(10);
    for (const p of QB_PALETTES) expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(QB_PALETTES.map((p) => p.accent)).size).toBe(QB_PALETTES.length);
  });
});
