// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderQb } from "./render-qb";
import type { QbConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const QB: QbConfig = {
  id: "q1", name: "Q1", productId: "p1",
  productTitle: "Snowboard", productImage: null,
  productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 72995 }],
  tiers: [
    { qty: 1, discountType: "percentage", discountValue: 0,  label: "Buy 1", isMostPopular: false, available: true },
    { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: true,  available: true },
    { qty: 3, discountType: "percentage", discountValue: 15, label: "15% off", isMostPopular: false, available: true },
  ],
  combinable: false, styleOverrides: null, textOverrides: null, headline: null, ctaLabel: null,
};

describe("renderQb", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders all tiers, marks MOST POPULAR, and selects most-popular tier by default", () => {
    renderQb(mount, QB, CONFIG);
    const rows = mount.querySelectorAll(".pumper-qb-tier");
    expect(rows.length).toBe(3);
    expect(mount.querySelector(".pumper-qb-popular-badge")?.textContent ?? "").toContain("MOST POPULAR");
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("1");
  });

  it("clicking another tier re-renders with that tier selected", () => {
    renderQb(mount, QB, CONFIG);
    const tier3 = mount.querySelector("[data-tier-index='2']") as HTMLElement;
    tier3.click();
    expect(mount.querySelector(".pumper-qb-tier--selected")?.getAttribute("data-tier-index")).toBe("2");
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta?.textContent ?? "").toMatch(/3/);
  });

  it("disables unavailable tier rows", () => {
    const q: QbConfig = { ...QB, tiers: [QB.tiers[0]!, QB.tiers[1]!, { ...QB.tiers[2]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.querySelector("[data-tier-index='2']")?.classList.contains("pumper-qb-tier--unavailable")).toBe(true);
  });

  it("skips a tier whose enabled is false", () => {
    const q: QbConfig = { ...QB, tiers: [
      { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, available: true },
      { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: false, available: true, enabled: false },
    ]};
    renderQb(mount, q, CONFIG);
    const rows = mount.querySelectorAll(".pumper-qb-tier");
    expect(rows.length).toBe(1);
    expect(mount.querySelector("[data-tier-index]")?.textContent ?? "").toMatch(/Buy 1|1/);
  });

  it("renders a single tier that omits enabled (backward compatible)", () => {
    const q: QbConfig = { ...QB, tiers: [
      { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: false, available: true },
    ]};
    renderQb(mount, q, CONFIG);
    const rows = mount.querySelectorAll(".pumper-qb-tier");
    expect(rows.length).toBe(1);
  });

  it("hides widget if all variants unavailable", () => {
    const q: QbConfig = { ...QB, productVariants: [{ ...QB.productVariants[0]!, available: false }] };
    renderQb(mount, q, CONFIG);
    expect(mount.innerHTML).toBe("");
  });

  it("renders gift badge when freeGiftVariantId is set + available", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Free Hat/);
  });

  it("renders bogo nth_free badge with paidQty hint", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, qty: 3, bogo: { mode: "nth_free", bonusQty: 1 } as const },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.textContent ?? "").toMatch(/Buy 3, pay for 2/);
  });

  it("stacks gift + bogo badges when both set on a tier", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      {
        ...QB.tiers[1]!,
        freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: true,
        bogo: { mode: "add_same", targetVariantId: "v8", bonusQty: 1, targetAvailable: true } as const,
      },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const badges = mount.querySelectorAll(".pumper-qb-tier-gift");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });

  it("shows muted unavailable badge when gift is OOS", () => {
    const q: QbConfig = { ...QB, tiers: [
      QB.tiers[0]!,
      { ...QB.tiers[1]!, freeGiftVariantId: "v9", freeGiftVariantTitle: "Hat", freeGiftAvailable: false },
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    const tierRow = mount.querySelectorAll(".pumper-qb-tier")[1] as HTMLElement;
    expect(tierRow.querySelector(".pumper-qb-tier-gift--unavailable")).not.toBeNull();
  });

  it("renders a tier image thumbnail when the tier has an image", () => {
    const q: QbConfig = { ...QB, tiers: [
      { ...QB.tiers[0]!, image: "https://cdn/x.png" },
      QB.tiers[1]!,
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    expect(mount.querySelector('img[src="https://cdn/x.png"]')).not.toBeNull();
  });

  it("renders a free-shipping badge when the tier has freeShipping", () => {
    const q: QbConfig = { ...QB, tiers: [
      { ...QB.tiers[0]!, freeShipping: true },
      QB.tiers[1]!,
      QB.tiers[2]!,
    ]};
    renderQb(mount, q, CONFIG);
    expect(mount.textContent ?? "").toContain("Free shipping");
  });

  it("renders no tier image when the tier has none", () => {
    renderQb(mount, QB, CONFIG);
    expect(mount.querySelector(".pumper-qb-tier img")).toBeNull();
  });

  it("renders override for qb.mostPopular when set", () => {
    const el = document.createElement("div");
    const q: QbConfig = {
      ...QB,
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: { "qb.mostPopular": "Best value" },
    };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("Best value");
    expect(el.innerHTML).not.toContain("MOST POPULAR");
  });

  it("falls back to default qb.mostPopular when override absent", () => {
    const el = document.createElement("div");
    const q: QbConfig = {
      ...QB,
      tiers: [{ qty: 2, discountType: "percentage", discountValue: 10, label: "10%", isMostPopular: true, available: true, freeGiftVariantId: null, freeGiftAvailable: null, bogo: null }],
      textOverrides: null,
    };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("MOST POPULAR");
  });

  it("uses qb.headline column when set", () => {
    const el = document.createElement("div");
    const q: QbConfig = { ...QB, headline: "Volume savings", textOverrides: null };
    renderQb(el, q, CONFIG);
    expect(el.innerHTML).toContain("Volume savings");
  });

  describe("subscribe & save purchase options", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      delete (window as any)._pumperConfig;
    });

    function parseItemsFromFormData(body: FormData) {
      const items: Record<string, { id: string; quantity: number; sellingPlan?: string; properties: Record<string, string> }> = {};
      for (const [key, value] of (body as unknown as { entries(): Iterable<[string, FormDataEntryValue]> }).entries()) {
        const m = key.match(/^items\[(\d+)\]\[(\w+)\](?:\[(\w+)\])?$/);
        if (!m) continue;
        const idx = m[1]!, field = m[2]!, sub = m[3];
        if (!items[idx]) items[idx] = { id: "", quantity: 0, properties: {} };
        const item = items[idx]!;
        if (field === "id") item.id = String(value);
        else if (field === "quantity") item.quantity = Number(value);
        else if (field === "selling_plan") item.sellingPlan = String(value);
        else if (field === "properties" && sub) item.properties[sub] = String(value);
      }
      return Object.keys(items).sort((a, b) => Number(a) - Number(b)).map((k) => items[k]!);
    }

    const SUB_QB: QbConfig = {
      ...QB,
      productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 2495 }],
      tiers: [
        { qty: 1, discountType: "percentage", discountValue: 0, label: "Buy 1", isMostPopular: true, available: true },
        { qty: 2, discountType: "percentage", discountValue: 10, label: "10% off", isMostPopular: false, available: true },
      ],
      subscription: {
        enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
        subtitle: "Cancel anytime", details: "x", widgetStyle: "modern",
        showDiscountLabel: true, hideThirdPartyWidget: false,
      },
    };

    function setPumperConfig() {
      (window as any)._pumperConfig = {
        shop: "s.myshopify.com", locale: "en", currency: "USD", apiBase: "/api",
        sellingPlanGroups: [{ id: "g", name: "Sub", plans: [{ id: "gid://shopify/SellingPlan/7", name: "Monthly" }] }],
        productVariants: [{
          variantId: "v1", title: "x", available: true, priceCents: 2495,
          sellingPlanAllocations: [{ planId: "gid://shopify/SellingPlan/7", priceCents: 2246 }],
        }],
      };
    }

    function mockFetch() {
      const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", f);
      Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
      return f;
    }

    it("renders the purchase-options block when subscription is enabled", () => {
      setPumperConfig();
      renderQb(mount, SUB_QB, CONFIG);
      expect(mount.querySelector(".pumper-po")).not.toBeNull();
      expect(mount.querySelector('[data-po-mode="subscribe"]')).not.toBeNull();
    });

    it("adds the line with items[0][selling_plan] when subscribe is chosen", async () => {
      setPumperConfig();
      const f = mockFetch();
      renderQb(mount, SUB_QB, CONFIG);

      (mount.querySelector('[data-po-mode="subscribe"]') as HTMLElement).click();
      (mount.querySelector("[data-action=add-to-cart]") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();

      expect(f).toHaveBeenCalledOnce();
      const init = f.mock.calls[0]![1] as RequestInit;
      const items = parseItemsFromFormData(init.body as FormData);
      expect(items[0]!.sellingPlan).toBe("7");
    });

    it("posts no selling_plan for one-time (default) selection", async () => {
      setPumperConfig();
      const f = mockFetch();
      renderQb(mount, SUB_QB, CONFIG);

      (mount.querySelector("[data-action=add-to-cart]") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();

      const init = f.mock.calls[0]![1] as RequestInit;
      const items = parseItemsFromFormData(init.body as FormData);
      expect(items[0]!.sellingPlan).toBeUndefined();
    });

    it("persists the subscribe choice across a tier switch", async () => {
      setPumperConfig();
      const f = mockFetch();
      renderQb(mount, SUB_QB, CONFIG);

      (mount.querySelector('[data-po-mode="subscribe"]') as HTMLElement).click();
      (mount.querySelector("[data-tier-index='1']") as HTMLElement).click();
      // After re-render the subscribe row should still be selected.
      expect(mount.querySelector('[data-po-mode="subscribe"]')?.getAttribute("aria-selected")).toBe("true");

      (mount.querySelector("[data-action=add-to-cart]") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();
      const init = f.mock.calls[0]![1] as RequestInit;
      const items = parseItemsFromFormData(init.body as FormData);
      expect(items[0]!.sellingPlan).toBe("7");
      expect(items[0]!.quantity).toBe(2);
    });

    it("does not render purchase options when subscription is disabled", () => {
      setPumperConfig();
      renderQb(mount, QB, CONFIG);
      expect(mount.querySelector(".pumper-po")).toBeNull();
    });
  });
});
