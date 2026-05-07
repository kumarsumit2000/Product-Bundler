import { describe, it, expect, beforeEach, vi } from "vitest";
import { addToCart } from "./add-to-cart";

describe("addToCart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts to /cart/add.js with line items + _pumper_bundle_id", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    // Fake redirect target so we don't actually navigate in jsdom
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    await addToCart("b1", [
      { variantId: "gid://shopify/ProductVariant/1", qty: 1 },
      { variantId: "gid://shopify/ProductVariant/2", qty: 2 },
    ]);

    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/cart/add.js");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.items.length).toBe(2);
    expect(body.items[0].properties._pumper_bundle_id).toBe("b1");
    expect(body.items[0].quantity).toBe(1);
    expect(body.items[1].quantity).toBe(2);
  });

  it("redirects to /cart when no theme drawer event fires within timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 10 });
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("/cart");
  });

  it("does not redirect when cart:refresh event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const promise = addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 50 });
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("");
  });

  it("returns ok:false on /cart/add.js failure (no redirect)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ description: "not avail" }), { status: 422, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1 }], { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(window.location.href).toBe("");
  });
});
