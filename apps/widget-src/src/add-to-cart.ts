export type CartLineInput = {
  variantId: string;
  qty: number;
  bundleId?: string;
  giftBundleId?: string;
};

export type AddResult = { ok: true } | { ok: false; error: string };

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
    setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs);
  });

  let res: Response;
  try {
    res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        items: lines.map((l) => {
          const properties: Record<string, string> = {};
          if (l.bundleId) properties._pumper_bundle_id = l.bundleId;
          if (l.giftBundleId) properties._pumper_gift_id = l.giftBundleId;
          return {
            id: l.variantId,
            quantity: l.qty,
            properties,
          };
        }),
      }),
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

  const drawerOpened = await drawerWillOpen;

  // Notify other page components (cart drawers, counters) regardless of outcome
  document.dispatchEvent(new CustomEvent("cart:refresh"));
  document.dispatchEvent(new CustomEvent("cart:update"));

  if (!drawerOpened) {
    window.location.href = "/cart";
  }

  return { ok: true };
}
