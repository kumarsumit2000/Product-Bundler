// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderBxgy } from "./render-bxgy";
import type { BxgyOfferConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const OFFER: BxgyOfferConfig = {
  id: "b1", name: "B1", productId: "p1",
  productTitle: "Snowboard", productImage: null,
  productVariants: [{ variantId: "v1", title: "Default", available: true, priceCents: 2495 }],
  bars: [
    { id: "bar1", title: "Buy 1 Get 1", subtitle: "", label: "", buyQty: 1, getQty: 1, buyDiscountPercent: 0, getDiscountPercent: 100, isMostPopular: true, badgeStyle: "save_percent", badgeText: "" },
  ],
  combinable: false, headline: null, ctaLabel: null, styleOverrides: null, textOverrides: null,
};

describe("renderBxgy", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders bars and selects most-popular bar by default", () => {
    renderBxgy(mount, OFFER, CONFIG);
    expect(mount.querySelectorAll(".pumper-qb-tier").length).toBe(1);
    expect(mount.querySelector(".pumper-qb-tier--selected")).not.toBeNull();
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

    const SUB_OFFER: BxgyOfferConfig = {
      ...OFFER,
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
      renderBxgy(mount, SUB_OFFER, CONFIG);
      expect(mount.querySelector(".pumper-po")).not.toBeNull();
      expect(mount.querySelector('[data-po-mode="subscribe"]')).not.toBeNull();
    });

    it("does not render purchase options when subscription is disabled", () => {
      setPumperConfig();
      renderBxgy(mount, OFFER, CONFIG);
      expect(mount.querySelector(".pumper-po")).toBeNull();
    });

    it("adds the buy line with items[0][selling_plan] when subscribe is chosen", async () => {
      setPumperConfig();
      const f = mockFetch();
      renderBxgy(mount, SUB_OFFER, CONFIG);

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
      renderBxgy(mount, SUB_OFFER, CONFIG);

      (mount.querySelector("[data-action=add-to-cart]") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();

      const init = f.mock.calls[0]![1] as RequestInit;
      const items = parseItemsFromFormData(init.body as FormData);
      expect(items[0]!.sellingPlan).toBeUndefined();
    });
  });
});
