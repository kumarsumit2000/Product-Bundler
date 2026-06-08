// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderBundle } from "./render-bundle";
import type { BundleConfig, WidgetConfig } from "./types";

const SETTINGS: WidgetConfig["settings"] = {
  primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
  borderRadius: 8, fontFamily: "inherit",
  bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
  showCompareAtPrice: true, currency: "USD", locale: "en",
};
const CONFIG: WidgetConfig = { shop: "s.myshopify.com", settings: SETTINGS, bundles: [], quantityBreaks: [] };

const BUNDLE: BundleConfig = {
  id: "b1", name: "Bundle 1", mode: "classic",
  products: [
    { productId: "p1", variantId: "v1", qty: 1, title: "Snowboard", image: null, available: true, priceCents: 72995 },
    { productId: "p2", variantId: "v2", qty: 1, title: "Bindings", image: null, available: true, priceCents: 62995 },
  ],
  collectionId: null, targetQty: null, collectionProducts: null,
  discountType: "percentage", discountValue: 10, combinable: false,
  triggerProductIds: [], headline: null, ctaLabel: null, styleOverrides: null, textOverrides: null,
      freeGiftVariantId: null,
      freeGiftVariantTitle: null,
      freeGiftAvailable: null,
};

describe("renderBundle", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("renders heading + each product row + CTA", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    expect(mount.querySelector(".pumper-bundle-heading")?.textContent).toContain("Frequently bought together");
    expect(mount.querySelectorAll(".pumper-bundle-row").length).toBe(2);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    expect(cta).not.toBeNull();
    expect(cta?.textContent ?? "").toMatch(/Add bundle to cart/);
  });

  it("shows OOS badge when one product is unavailable + disables CTA", () => {
    const b: BundleConfig = { ...BUNDLE, products: [
      { ...BUNDLE.products[0]!, available: false },
      BUNDLE.products[1]!,
    ]};
    renderBundle(mount, b, CONFIG);
    expect(mount.querySelector(".pumper-oos-badge")).not.toBeNull();
    const cta = mount.querySelector("[data-action=add-to-cart]") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });

  it("clears mount and returns when all products are OOS (hide widget)", () => {
    const b: BundleConfig = { ...BUNDLE, products: BUNDLE.products.map((p) => ({ ...p, available: false })) };
    renderBundle(mount, b, CONFIG);
    expect(mount.innerHTML).toBe("");
    expect(mount.style.minHeight).toBe("");
  });

  it("renders savings inside the CTA label", () => {
    renderBundle(mount, BUNDLE, CONFIG);
    const cta = mount.querySelector("[data-action=add-to-cart]");
    // savings = 10% of (72995 + 62995) = 13599 cents
    expect((cta?.textContent ?? "").toLowerCase()).toMatch(/save/);
  });

  it("renders bundle with textOverrides for totalLabel", () => {
    const el = document.createElement("div");
    const bundle: BundleConfig = { ...BUNDLE, textOverrides: { "bundle.totalLabel": "Your cost" } };
    renderBundle(el, bundle, CONFIG);
    expect(el.innerHTML).toContain("Your cost");
  });

  it("falls back to default totalLabel when override absent", () => {
    const el = document.createElement("div");
    const bundle: BundleConfig = { ...BUNDLE, textOverrides: null };
    renderBundle(el, bundle, CONFIG);
    expect(el.innerHTML).toContain("Total");
  });

  it("renders bundle.savingsBadge with override when savings > 0", () => {
    const el = document.createElement("div");
    const bundle: BundleConfig = {
      ...BUNDLE,
      discountValue: 20,
      textOverrides: { "bundle.savingsBadge": "You save {savings}!" },
    };
    renderBundle(el, bundle, CONFIG);
    expect(el.innerHTML).toContain("You save");
  });

  it("renders default bundle.savingsBadge text when override absent", () => {
    const el = document.createElement("div");
    const bundle: BundleConfig = { ...BUNDLE, discountValue: 20, textOverrides: null };
    renderBundle(el, bundle, CONFIG);
    expect(el.innerHTML).toContain("Save"); // default i18n is "Save {savings}"
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

    const SUB_BUNDLE: BundleConfig = {
      ...BUNDLE,
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
        productVariants: [
          {
            variantId: "v1", title: "x", available: true, priceCents: 72995,
            sellingPlanAllocations: [{ planId: "gid://shopify/SellingPlan/7", priceCents: 65695 }],
          },
          // Second component has NO allocations — must stay one-time.
          { variantId: "v2", title: "y", available: true, priceCents: 62995 },
        ],
      };
    }

    function mockFetch() {
      const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
      vi.stubGlobal("fetch", f);
      Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
      return f;
    }

    it("sets selling_plan only on components with a matching allocation", async () => {
      setPumperConfig();
      const f = mockFetch();
      renderBundle(mount, SUB_BUNDLE, CONFIG);

      (mount.querySelector('[data-po-mode="subscribe"]') as HTMLElement).click();
      (mount.querySelector("[data-action=add-to-cart]") as HTMLElement).click();
      await Promise.resolve();
      await Promise.resolve();

      expect(f).toHaveBeenCalledOnce();
      const init = f.mock.calls[0]![1] as RequestInit;
      const items = parseItemsFromFormData(init.body as FormData);
      expect(items[0]!.sellingPlan).toBe("7");
      expect(items[1]!.sellingPlan).toBeUndefined();
    });
  });
});
