import { describe, it, expect, beforeEach } from "vitest";
import { createPurchaseOptions } from "./render-purchase-options";
import type { SubscriptionConfig, SellingPlanGroup, SellingPlanAllocation } from "./types";

const cfg: SubscriptionConfig = {
  enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
  subtitle: "Cancel anytime", details: "x", widgetStyle: "modern",
  showDiscountLabel: true, hideThirdPartyWidget: false,
};
const groups: SellingPlanGroup[] = [{ id: "g1", name: "Subscribe", plans: [{ id: "gid://shopify/SellingPlan/7", name: "Monthly" }] }];
const allocs: SellingPlanAllocation[] = [{ planId: "gid://shopify/SellingPlan/7", priceCents: 2246 }];

describe("createPurchaseOptions", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("defaults to one-time selection (no selling plan)", () => {
    const po = createPurchaseOptions(mount, cfg, { groups, allocations: allocs, oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    expect(po.getSelection()).toEqual({ mode: "onetime", sellingPlanId: null });
  });

  it("returns the selling plan id after selecting subscribe", () => {
    const po = createPurchaseOptions(mount, cfg, { groups, allocations: allocs, oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    (mount.querySelector('[data-po-mode="subscribe"]') as HTMLElement).click();
    expect(po.getSelection()).toEqual({ mode: "subscribe", sellingPlanId: "gid://shopify/SellingPlan/7" });
  });

  it("renders nothing and reports inactive when there are no selling plans", () => {
    const po = createPurchaseOptions(mount, cfg, { groups: [], allocations: [], oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    expect(po.active).toBe(false);
    expect(mount.children.length).toBe(0);
  });
});
