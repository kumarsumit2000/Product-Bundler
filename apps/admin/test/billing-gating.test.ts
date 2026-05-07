import { describe, it, expect } from "vitest";
import { canCreateNew } from "../app/lib/billing/gating";
import type { UsageSnapshot } from "../app/lib/billing/usage";

function snapshot(overrides: Partial<UsageSnapshot> = {}): UsageSnapshot {
  return {
    plan: "free",
    monthlyOrderCount: 0,
    lifetimeOrderCount: 0,
    orderCap: 50,
    isLifetimeCap: true,
    percentUsed: 0,
    overOnce: false,
    resetAt: null,
    ...overrides,
  };
}

describe("canCreateNew", () => {
  it("free plan with 49 lifetime orders → allowed", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 49 }));
    expect(r.allowed).toBe(true);
  });

  it("free plan with exactly 50 lifetime orders → blocked", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 50 }));
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.upgradeUrl).toBe("/app/billing");
      expect(r.reason).toMatch(/free/i);
    }
  });

  it("free plan with 100 lifetime orders → blocked", () => {
    const r = canCreateNew(snapshot({ lifetimeOrderCount: 100 }));
    expect(r.allowed).toBe(false);
  });

  it("starter plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "starter", isLifetimeCap: false, lifetimeOrderCount: 5000 }));
    expect(r.allowed).toBe(true);
  });

  it("growth plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "growth", isLifetimeCap: false, lifetimeOrderCount: 99999 }));
    expect(r.allowed).toBe(true);
  });

  it("unlimited plan with any count → allowed", () => {
    const r = canCreateNew(snapshot({ plan: "unlimited", isLifetimeCap: false, lifetimeOrderCount: 99999 }));
    expect(r.allowed).toBe(true);
  });
});
