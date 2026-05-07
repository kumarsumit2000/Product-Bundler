import { describe, it, expect, beforeEach, vi } from "vitest";
import { emit, configureAnalytics } from "./analytics";

describe("analytics.emit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any)._pumperPreview;
  });

  it("posts via sendBeacon when available", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s.myshopify.com" });
    emit("widget_impression", { widgetType: "bundle", widgetId: "b1", productId: "p1" });
    expect(beacon).toHaveBeenCalledOnce();
    const call = beacon.mock.calls[0] as unknown as [string, string];
    const [url, payload] = call;
    expect(url).toBe("https://x/api/storefront/event");
    const parsed = JSON.parse(payload);
    expect(parsed.type).toBe("widget_impression");
    expect(parsed.shop).toBe("s.myshopify.com");
    expect(parsed.widgetId).toBe("b1");
    expect(typeof parsed.ts).toBe("number");
  });

  it("is a no-op in preview mode", () => {
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    (window as any)._pumperPreview = true;
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s" });
    emit("add_to_cart", { widgetType: "bundle", widgetId: "b1", valueCents: 100 });
    expect(beacon).not.toHaveBeenCalled();
  });

  it("falls back to fetch when sendBeacon is missing", async () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", f);
    configureAnalytics({ apiBase: "https://x/api/storefront", shop: "s" });
    emit("widget_click", { widgetType: "qb", widgetId: "q1", productId: "p1", tierQty: 3 });
    expect(f).toHaveBeenCalledOnce();
  });
});
