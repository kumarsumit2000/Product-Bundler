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

  const rows = bundle.products.map((p) => {
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
  }).join('<div class="pumper-plus">+</div>');

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

  const giftBadge = bundle.freeGiftVariantId && bundle.freeGiftAvailable
    ? `<div class="pumper-qb-gift-badge">🎁 + Free ${escapeHtml(bundle.freeGiftVariantTitle ?? "gift")}</div>`
    : bundle.freeGiftVariantId
      ? `<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">🎁 Free gift unavailable — out of stock</div>`
      : "";

  const sub = bundle.subscription;
  const subRow = sub && sub.enabled
    ? `<label class="pumper-sub-row">
         <input type="checkbox" data-pumper-subscribe />
         <span>Subscribe & save ${sub.discountPercent}% (${sub.interval})</span>
       </label>`
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
      ${subRow}
      <button class="pumper-cta" data-action="add-to-cart" ${anyOOS ? "disabled" : ""}>${escapeHtml(ctaLabel)}</button>
    </section>
  `;

  emit("widget_impression", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });

  const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
  if (cta && !anyOOS) {
    cta.addEventListener("click", async () => {
      cta.disabled = true;
      emit("widget_click", { widgetType: "bundle", widgetId: bundle.id, productId: bundle.products[0]?.productId ?? "" });
      const subBox = mount.querySelector<HTMLInputElement>("[data-pumper-subscribe]");
      const subActive = !!(sub && sub.enabled && subBox?.checked);
      const subProps: Record<string, string> | undefined = subActive
        ? {
            _pumper_subscribe: "1",
            _pumper_subscribe_pct: String(sub!.discountPercent),
            _pumper_subscribe_interval: sub!.interval,
          }
        : undefined;
      const lines = bundle.products
        .filter((p) => p.variantId)
        .map((p) => ({ variantId: p.variantId!, qty: p.qty, bundleId: bundle.id, extraProperties: subProps }));
      if (bundle.freeGiftVariantId && bundle.freeGiftAvailable) {
        lines.push({ variantId: bundle.freeGiftVariantId, qty: 1, bundleId: bundle.id, extraProperties: subProps });
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
