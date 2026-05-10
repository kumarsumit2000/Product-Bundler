import type { StickyAtcConfig } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function findCartForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>('form[action*="/cart/add"]');
}

function findFormSubmit(form: HTMLFormElement): HTMLButtonElement | HTMLInputElement | null {
  return (
    form.querySelector<HTMLButtonElement>('button[type="submit"]') ??
    form.querySelector<HTMLInputElement>('input[type="submit"]') ??
    form.querySelector<HTMLButtonElement>('button[name="add"]') ??
    null
  );
}

function findProductImage(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
  if (meta?.content) return meta.content;
  const img = document.querySelector<HTMLImageElement>(".product__image img, .product-single__photo img, [data-product-image] img");
  return img?.src ?? null;
}

function findProductTitle(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (meta?.content) return meta.content;
  const h = document.querySelector<HTMLHeadingElement>(".product__title, .product-single__title, h1");
  return h?.textContent?.trim() ?? null;
}

function findPriceText(): string | null {
  const el = document.querySelector<HTMLElement>(".price__regular .price-item, [data-product-price]");
  return el?.textContent?.trim() ?? null;
}

function applyStyles(target: HTMLElement, c: StickyAtcConfig): void {
  target.style.setProperty("--sa-bg", c.backgroundColor);
  target.style.setProperty("--sa-text", c.textColor);
  target.style.setProperty("--sa-btn-bg", c.buttonBg);
  target.style.setProperty("--sa-btn-text", c.buttonText);
}

export function startStickyAtc(c: StickyAtcConfig): void {
  // Only PDPs have a cart-add form. Bail otherwise.
  const form = findCartForm();
  if (!form) return;
  const trigger = findFormSubmit(form);
  if (!trigger) return;

  // Already mounted? (e.g. on SPA navigation)
  if (document.querySelector("[data-pumper-sticky]")) return;

  const wrap = document.createElement("div");
  wrap.setAttribute("data-pumper-sticky", "1");
  wrap.className = "pumper-sticky";
  applyStyles(wrap, c);

  const image = c.showImage ? findProductImage() : null;
  const title = findProductTitle();
  const priceText = c.showPrice ? findPriceText() : null;

  wrap.innerHTML = `
    <div class="pumper-sticky-inner">
      ${image ? `<img class="pumper-sticky-img" src="${escapeHtml(image)}" alt="" />` : ""}
      <div class="pumper-sticky-meta">
        ${title ? `<div class="pumper-sticky-title">${escapeHtml(title)}</div>` : ""}
        ${priceText ? `<div class="pumper-sticky-price">${escapeHtml(priceText)}</div>` : ""}
      </div>
      ${c.showQty ? `<input type="number" class="pumper-sticky-qty" min="1" value="1" />` : ""}
      <button type="button" class="pumper-sticky-cta">${escapeHtml(c.ctaLabel)}</button>
    </div>
  `;

  document.body.appendChild(wrap);

  // Wire CTA: copy qty into form, submit native form so theme handlers run.
  const qtyInput = wrap.querySelector<HTMLInputElement>(".pumper-sticky-qty");
  const cta = wrap.querySelector<HTMLButtonElement>(".pumper-sticky-cta");
  cta?.addEventListener("click", () => {
    if (qtyInput) {
      const formQty = form.querySelector<HTMLInputElement>('input[name="quantity"]');
      if (formQty) formQty.value = qtyInput.value || "1";
    }
    if (typeof trigger.click === "function") trigger.click();
  });

  // Show only when the original ATC button is out of viewport.
  const observer = new IntersectionObserver((entries) => {
    const visible = entries[0]?.isIntersecting;
    wrap.classList.toggle("pumper-sticky--visible", !visible);
  }, { threshold: 0.1 });
  observer.observe(trigger);
}
