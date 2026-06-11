// Integrate the QB widget with the theme's native product form add-to-cart.
// Quantity sync is the robust core; extras interception is best-effort.

export function findProductForm(mount: HTMLElement): HTMLFormElement | null {
  return (
    (mount.closest('form[action*="/cart/add"]') as HTMLFormElement | null) ??
    (document.querySelector('form[action*="/cart/add"]') as HTMLFormElement | null)
  );
}

export function syncThemeQuantity(form: HTMLFormElement | null, qty: number): void {
  if (!form) return;
  const input = form.querySelector('input[name="quantity"]') as HTMLInputElement | null;
  if (!input) return;
  input.value = String(qty);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function bindThemeAddToCart(
  form: HTMLFormElement,
  opts: { hasExtras: () => boolean; addLines: () => Promise<void> },
): () => void {
  const handler = (e: Event) => {
    if (!opts.hasExtras()) return; // native flow proceeds with the synced quantity
    e.preventDefault();
    e.stopPropagation();
    void opts.addLines();
  };
  form.addEventListener("submit", handler, true);
  const atc = form.querySelector('button[type="submit"], [name="add"]');
  atc?.addEventListener("click", handler, true);
  return () => {
    form.removeEventListener("submit", handler, true);
    atc?.removeEventListener("click", handler, true);
  };
}
