import type { BundleConfig, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import { emit } from "./analytics";
import { computeBundleTotals, formatMoney } from "./format";
import { t, tWith } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderBundle(mount: HTMLElement, bundle: BundleConfig, config: WidgetConfig): void {
  const allOOS = bundle.products.every((p) => !p.available);
  if (allOOS) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    mount.removeAttribute("data-pumper-rendered");
    return;
  }

  const anyOOS = bundle.products.some((p) => !p.available);
  const totals = computeBundleTotals(bundle, bundle.discountType, bundle.discountValue);
  const heading = bundle.headline || config.settings.bundleHeadline || t("bundle.heading");

  const productRows = bundle.products.map((p) => {
    const oosBadge = p.available
      ? ""
      : `<span class="pumper-oos-badge">Out of stock</span>`;
    const img = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="" class="pumper-thumb" loading="lazy" />`
      : `<div class="pumper-thumb pumper-thumb-empty"></div>`;
    return `
      <div class="pumper-bundle-row${p.available ? "" : " pumper-bundle-row--oos"}">
        ${img}
        <div class="pumper-row-meta">
          <div class="pumper-row-title">${escapeHtml(p.title)}</div>
          <div class="pumper-row-sub">Qty ${p.qty} · ${formatMoney(p.priceCents, config.settings.currency, config.settings.locale)}</div>
        </div>
        ${oosBadge}
      </div>
    `;
  });

  const giftRow = (() => {
    // Specific variant mode
    if (bundle.freeGiftVariantId && bundle.freeGiftAvailable) {
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift">
          <div class="pumper-thumb pumper-thumb-emoji">🎁</div>
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(bundle.freeGiftVariantTitle ?? "Free gift")}</div>
            <div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this bundle</div>
          </div>
        </div>
      `;
    }
    // Product mode — customer picks a variant
    if (bundle.freeGiftProductId && (bundle.freeGiftProductVariants?.length ?? 0) > 0) {
      const variants = bundle.freeGiftProductVariants ?? [];
      const hasAvailable = variants.some((v) => v.available);
      if (!hasAvailable) return null;
      const img = bundle.freeGiftProductImage
        ? `<img src="${escapeHtml(bundle.freeGiftProductImage)}" alt="" class="pumper-thumb" loading="lazy" />`
        : `<div class="pumper-thumb pumper-thumb-emoji">🎁</div>`;
      const select = variants.length > 1
        ? `<select class="pumper-gift-variant" data-pumper-gift-variant>
             ${variants
               .map((v) => `<option value="${escapeHtml(v.variantId)}" ${!v.available ? "disabled" : ""}>${escapeHtml(v.title)}${!v.available ? " (out of stock)" : ""}</option>`)
               .join("")}
           </select>`
        : "";
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift">
          ${img}
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(bundle.freeGiftProductTitle ?? "Free gift")}</div>
            <div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this bundle</div>
            ${select}
          </div>
        </div>
      `;
    }
    return null;
  })();

  const allRows = giftRow ? [...productRows, giftRow] : productRows;
  const rows = allRows.join('<div class="pumper-plus">+</div>');

  const savingsBadge = totals.savingsCents > 0
    ? `<span class="pumper-bundle-savings">${escapeHtml(tWith(bundle.textOverrides, "bundle.savingsBadge", { savings: formatMoney(totals.savingsCents, config.settings.currency, config.settings.locale) }))}</span>`
    : "";

  const totalLine = `
    <div class="pumper-total-row">
      <span class="pumper-total-label">${tWith(bundle.textOverrides, "bundle.totalLabel")}
        ${config.settings.showCompareAtPrice ? `<span class="pumper-strike">${formatMoney(totals.subtotalCents, config.settings.currency, config.settings.locale)}</span>` : ""}
      </span>
      <span class="pumper-total-value">${formatMoney(totals.discountedCents, config.settings.currency, config.settings.locale)}</span>
      ${savingsBadge}
    </div>
  `;

  // Gift in-stock cases render as their own bundle row above. The badge
  // here is just the out-of-stock fallback so the customer still sees the
  // promised gift even when we can't include it.
  const giftBadge = bundle.freeGiftVariantId && !bundle.freeGiftAvailable
    ? `<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">🎁 Free gift unavailable — out of stock</div>`
    : "";

  const ctaLabel = anyOOS
    ? t("bundle.unavailable")
    : (bundle.ctaLabel ?? (totals.savingsCents > 0
        ? t("bundle.ctaSavings", { savings: formatMoney(totals.savingsCents, config.settings.currency, config.settings.locale) })
        : t("bundle.cta")));

  mount.innerHTML = `
    <section class="pumper-card pumper-bundle">
      <h3 class="pumper-bundle-heading">${escapeHtml(heading)}</h3>
      <div class="pumper-bundle-rows">${rows}</div>
      ${giftBadge}
      ${totalLine}
      <button class="pumper-cta" data-action="add-to-cart" ${anyOOS ? "disabled" : ""}>${escapeHtml(ctaLabel)}</button>
    </section>
  `;

  emit("widget_impression", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });

  const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
  if (cta && !anyOOS) {
    cta.addEventListener("click", async () => {
      cta.disabled = true;
      emit("widget_click", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });
      const lines = bundle.products
        .filter((p) => p.variantId)
        .map((p) => ({ variantId: p.variantId!, qty: p.qty, bundleId: bundle.id }));
      const giftTag = `${bundle.id}:gift`;
      if (bundle.freeGiftVariantId && bundle.freeGiftAvailable) {
        lines.push({ variantId: bundle.freeGiftVariantId, qty: 1, bundleId: bundle.id, giftBundleId: giftTag });
      } else if (bundle.freeGiftProductId && (bundle.freeGiftProductVariants?.length ?? 0) > 0) {
        const variants = bundle.freeGiftProductVariants ?? [];
        const select = mount.querySelector<HTMLSelectElement>("[data-pumper-gift-variant]");
        const chosen = select?.value
          || variants.find((v) => v.available)?.variantId
          || variants[0]?.variantId;
        if (chosen) {
          lines.push({ variantId: chosen, qty: 1, bundleId: bundle.id, giftBundleId: giftTag });
        }
      }
      const result = await addToCart(bundle.id, lines);
      if (!result.ok) {
        cta.disabled = false;
        cta.textContent = t("addToCart.error");
        setTimeout(() => { cta.textContent = ctaLabel; }, 2500);
      } else {
        emit("add_to_cart", { widgetType: "bundle", widgetId: bundle.id, valueCents: totals.discountedCents });
      }
    });
  }
}
