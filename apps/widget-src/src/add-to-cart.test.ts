import { describe, it, expect, beforeEach, vi } from "vitest";
import { addToCart, toCartVariantId } from "./add-to-cart";

// Extracts items from the FormData body that addToCart now sends.
// Returns [{ id, quantity, properties }] mirroring the legacy JSON shape
// so the existing assertions stay readable.
function parseItemsFromFormData(body: FormData): Array<{ id: string; quantity: number; properties: Record<string, string> }> {
  const items: Record<string, { id: string; quantity: number; properties: Record<string, string> }> = {};
  for (const [key, value] of (body as unknown as { entries(): Iterable<[string, FormDataEntryValue]> }).entries()) {
    const m = key.match(/^items\[(\d+)\]\[(\w+)\](?:\[(\w+)\])?$/);
    if (!m) continue;
    const idx = m[1]!;
    const field = m[2]!;
    const sub = m[3];
    if (!items[idx]) items[idx] = { id: "", quantity: 0, properties: {} };
    const item = items[idx]!;
    if (field === "id") item.id = String(value);
    else if (field === "quantity") item.quantity = Number(value);
    else if (field === "properties" && sub) item.properties[sub] = String(value);
  }
  return Object.keys(items).sort((a, b) => Number(a) - Number(b)).map((k) => items[k]!);
}

describe("toCartVariantId", () => {
  it("strips gid://shopify/ProductVariant/ prefix to return the numeric id", () => {
    expect(toCartVariantId("gid://shopify/ProductVariant/12345")).toBe("12345");
    expect(toCartVariantId("gid://shopify/ProductVariant/9876543210")).toBe("9876543210");
  });
  it("passes through already-numeric ids unchanged (defensive)", () => {
    expect(toCartVariantId("12345")).toBe("12345");
  });
  it("passes through unrecognized formats unchanged", () => {
    expect(toCartVariantId("not-a-gid")).toBe("not-a-gid");
  });
});

describe("addToCart", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts to /cart/add.js with line items + _pumper_bundle_id; strips gid prefix from variantId", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });

    await addToCart("b1", [
      { variantId: "gid://shopify/ProductVariant/1", qty: 1, bundleId: "b1" },
      { variantId: "gid://shopify/ProductVariant/2", qty: 2, bundleId: "b1" },
    ]);

    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/cart/add.js");
    const items = parseItemsFromFormData((init as RequestInit).body as FormData);
    expect(items.length).toBe(2);
    // /cart/add.js requires numeric variant ids
    expect(items[0]!.id).toBe("1");
    expect(items[1]!.id).toBe("2");
    expect(items[0]!.properties._pumper_bundle_id).toBe("b1");
    expect(items[0]!.quantity).toBe(1);
    expect(items[1]!.quantity).toBe(2);
  });

  it("redirects to /cart when no theme drawer event fires within timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 10 });
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("/cart");
  });

  it("does not redirect when cart:refresh event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const promise = addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 50 });
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("");
  });

  it("returns ok:false on /cart/add.js failure (no redirect)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ description: "not avail" }), { status: 422, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const result = await addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(window.location.href).toBe("");
  });

  it("posts a multi-line cart-add when given multiple CartLineInputs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    await addToCart("b1", [
      { variantId: "v1", qty: 2, bundleId: "b1" },
      { variantId: "v2", qty: 1, bundleId: "b1", giftBundleId: "b1" },
    ], { timeoutMs: 10 });
    const f = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const init = f.mock.calls[0]![1] as RequestInit;
    const items = parseItemsFromFormData(init.body as FormData);
    expect(items.length).toBe(2);
    expect(items[0]!.properties._pumper_bundle_id).toBe("b1");
    expect(items[0]!.properties._pumper_gift_id).toBeUndefined();
    expect(items[1]!.properties._pumper_bundle_id).toBe("b1");
    expect(items[1]!.properties._pumper_gift_id).toBe("b1");
  });

  it("each line's qty is preserved in the cart-add request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    await addToCart("b1", [
      { variantId: "v1", qty: 3, bundleId: "b1" },
      { variantId: "v2", qty: 2, bundleId: "b1", giftBundleId: "b1" },
    ], { timeoutMs: 10 });
    const f = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const init = f.mock.calls[0]![1] as RequestInit;
    const items = parseItemsFromFormData(init.body as FormData);
    expect(items[0]!.quantity).toBe(3);
    expect(items[1]!.quantity).toBe(2);
  });

  it("does not redirect when upcart:opened event fires (drawer-specific)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const promise = addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 50 });
    document.dispatchEvent(new CustomEvent("upcart:opened"));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("");
  });

  it("appends items[i][selling_plan] when sellingPlanId is set", async () => {
    const calls: FormData[] = [];
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      calls.push(init.body as FormData);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    await addToCart("b1", [{ variantId: "gid://shopify/ProductVariant/42", qty: 2, sellingPlanId: "gid://shopify/SellingPlan/7" }], { timeoutMs: 0 });
    const body = calls[0]!;
    expect(body.get("items[0][selling_plan]")).toBe("7");
    expect(body.get("items[0][id]")).toBe("42");
  });
});
