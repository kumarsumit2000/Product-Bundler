import { notifyCartDrawer, DRAWER_OPEN_EVENTS } from "./cart-drawer-bridge";

export type CartLineInput = {
  variantId: string;
  qty: number;
  bundleId?: string;
  giftBundleId?: string;
  extraProperties?: Record<string, string>;
  sellingPlanId?: string;
};

export type AddResult = { ok: true } | { ok: false; error: string };

// Shopify's /cart/add.js endpoint requires the numeric variant id, not the
// gid://shopify/ProductVariant/<n> form. Variants stored in our config are
// GIDs (from Admin API); strip down before submitting to the storefront cart.
export function toCartVariantId(variantId: string): string {
  // Strip a gid://shopify/<Type>/<n> global id down to the trailing numeric id.
  // Covers ProductVariant (cart item id) and SellingPlan (selling_plan id).
  const m = variantId.match(/\/(?:ProductVariant|SellingPlan)\/(\d+)/);
  return m ? m[1]! : variantId;
}

export async function addToCart(
  bundleId: string,
  lines: CartLineInput[],
  opts: { timeoutMs?: number } = {},
): Promise<AddResult> {
  // No-op in admin preview iframe: there is no real cart on this origin and
  // calling /cart/add.js would 404 then surface as "Couldn't add to cart".
  if (typeof window !== "undefined" && window._pumperPreview) {
    return { ok: true };
  }

  const timeoutMs = opts.timeoutMs ?? 800;

  const drawerWillOpen = new Promise<boolean>((resolve) => {
    let done = false;
    const onChange = () => { if (!done) { done = true; resolve(true); } };
    document.addEventListener("cart:refresh", onChange, { once: true });
    document.addEventListener("cart:update", onChange, { once: true });
    for (const ev of DRAWER_OPEN_EVENTS) {
      document.addEventListener(ev, onChange, { once: true });
    }
    setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs);
  });

  // Build the request the same way Shopify's stock theme does — FormData
  // (browser sets multipart Content-Type) and no `X-Requested-With`. Some
  // stores' Cloudflare WAF profiles flag JSON+XHR-style POSTs to /cart/add.js
  // as bot traffic and answer with a 429 "Just a moment…" challenge. The
  // multipart form pattern is the one Shopify's reference themes use, so
  // it routinely passes the WAF unchallenged.
  const formData = new FormData();
  lines.forEach((l, i) => {
    formData.append(`items[${i}][id]`, toCartVariantId(l.variantId));
    formData.append(`items[${i}][quantity]`, String(l.qty));
    if (l.sellingPlanId) {
      formData.append(`items[${i}][selling_plan]`, toCartVariantId(l.sellingPlanId));
    }
    const properties: Record<string, string> = {};
    if (l.bundleId) properties._pumper_bundle_id = l.bundleId;
    if (l.giftBundleId) properties._pumper_gift_id = l.giftBundleId;
    if (l.extraProperties) Object.assign(properties, l.extraProperties);
    for (const [k, v] of Object.entries(properties)) {
      formData.append(`items[${i}][properties][${k}]`, v);
    }
  });

  let res: Response;
  try {
    res = await fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Network error" };
  }

  if (!res.ok) {
    let errMsg = "Could not add to cart";
    try {
      const j = (await res.json()) as { description?: string };
      if (j.description) errMsg = j.description;
    } catch {
      // ignore
    }
    return { ok: false, error: errMsg };
  }

  // Drawer-specific events / imperative API calls fire BEFORE we await drawerWillOpen.
  // notifyCartDrawer deliberately does NOT dispatch cart:refresh — that's dispatched
  // post-await for cart-counter widgets and as a fallthrough for drawers that listen
  // to it but missed our drawer-specific signals.
  notifyCartDrawer();

  const drawerOpened = await drawerWillOpen;

  // Generic cart events for cart-counter widgets and drawers that only listen here.
  document.dispatchEvent(new CustomEvent("cart:refresh"));
  document.dispatchEvent(new CustomEvent("cart:update"));

  if (!drawerOpened) {
    window.location.href = "/cart";
  }

  return { ok: true };
}
