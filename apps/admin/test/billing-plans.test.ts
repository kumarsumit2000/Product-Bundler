import { describe, it, expect } from "vitest";
import { PLANS, getPlan, isPaidPlan } from "../app/lib/billing/plans";

describe("PLANS", () => {
  it("has 4 tiers with correct prices in cents", () => {
    expect(PLANS.free.priceCents).toBe(0);
    expect(PLANS.starter.priceCents).toBe(1900);
    expect(PLANS.growth.priceCents).toBe(4900);
    expect(PLANS.unlimited.priceCents).toBe(9900);
  });

  it("has correct order caps", () => {
    expect(PLANS.free.orderCap).toBe(50);
    expect(PLANS.starter.orderCap).toBe(300);
    expect(PLANS.growth.orderCap).toBe(1000);
    expect(PLANS.unlimited.orderCap).toBe(3000);
  });

  it("free plan uses lifetime cap; paid plans do not", () => {
    expect(PLANS.free.isLifetimeCap).toBe(true);
    expect(PLANS.starter.isLifetimeCap).toBe(false);
    expect(PLANS.growth.isLifetimeCap).toBe(false);
    expect(PLANS.unlimited.isLifetimeCap).toBe(false);
  });

  it("paid plans charge $0.05 per order overage; free plan zero", () => {
    expect(PLANS.free.overageCents).toBe(0);
    expect(PLANS.starter.overageCents).toBe(5);
    expect(PLANS.growth.overageCents).toBe(5);
    expect(PLANS.unlimited.overageCents).toBe(5);
  });

  it("paid plans give 7-day trial; free is 0", () => {
    expect(PLANS.free.trialDays).toBe(0);
    expect(PLANS.starter.trialDays).toBe(7);
    expect(PLANS.growth.trialDays).toBe(7);
    expect(PLANS.unlimited.trialDays).toBe(7);
  });
});

describe("getPlan", () => {
  it("returns the plan for a valid id", () => {
    expect(getPlan("starter").name).toBe("Starter");
  });
  it("throws on invalid id", () => {
    expect(() => getPlan("nonsense")).toThrow();
  });
});

describe("isPaidPlan", () => {
  it("returns false for free, true for paid tiers", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("starter")).toBe(true);
    expect(isPaidPlan("growth")).toBe(true);
    expect(isPaidPlan("unlimited")).toBe(true);
  });
});
