import type { QbConfig, QbTier, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import type { CartLineInput } from "./add-to-cart";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { t, tWith } from "./i18n";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderGiftBadges(tier: QbTier, textOverrides: Record<string, string> | null | undefined): string {
  const badges: string[] = [];

  if (tier.freeGiftVariantId) {
    if (tier.freeGiftAvailable === false) {
      badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
    } else {
      badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(tWith(textOverrides, "qb.giftBadge", { variantTitle: tier.freeGiftVariantTitle ?? "gift" }))}</div>`);
    }
  }

  if (tier.bogo) {
    const b = tier.bogo;
    if (b.mode === "nth_free") {
      const paidQty = Math.max(0, tier.qty - b.bonusQty);
      badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.bogoNthFree", { qty: tier.qty, paidQty }))}</div>`);
    } else if (b.mode === "add_same") {
      if (b.targetAvailable === false) {
        badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
      } else {
        const text = b.bonusQty === 1
          ? t("qb.bogoSameOne")
          : t("qb.bogoSameMany", { n: b.bonusQty });
        badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(text)}</div>`);
      }
    } else if (b.mode === "add_different") {
      if (b.targetAvailable === false) {
        badges.push(`<div class="pumper-qb-gift-badge pumper-qb-gift-badge--unavailable">${escapeHtml(t("qb.giftBadgeUnavailable"))}</div>`);
      } else {
        badges.push(`<div class="pumper-qb-gift-badge">${escapeHtml(t("qb.bogoDifferent", { variantTitle: b.targetVariantTitle ?? "gift" }))}</div>`);
      }
    }
  }

  return badges.join("");
}

function tierUnitCents(tier: QbTier, basePriceCents: number): number {
  if (tier.discountType === "percentage") return Math.round(basePriceCents * (1 - tier.discountValue / 100));
  if (tier.discountType === "flat") return Math.max(0, basePriceCents - Math.round(tier.discountValue * 100));
  if (tier.discountType === "fixed_per_unit") return Math.max(0, Math.round(tier.discountValue * 100));
  return basePriceCents;
}

export function renderQb(mount: HTMLElement, qb: QbConfig, config: WidgetConfig): void {
  const variant = qb.productVariants.find((v) => v.available) ?? qb.productVariants[0];
  if (!variant || qb.productVariants.every((v) => !v.available)) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    return;
  }

  const popularIndex = qb.tiers.findIndex((tr) => tr.isMostPopular && tr.available);
  let selectedIndex = popularIndex >= 0 ? popularIndex : qb.tiers.findIndex((tr) => tr.available);
  if (selectedIndex < 0) selectedIndex = 0;

  const heading = qb.headline || config.settings.qbHeadline || t("qb.heading");

  const renderRows = () => qb.tiers.map((tr, i) => {
    const unitCents = tierUnitCents(tr, variant.priceCents);
    const totalCents = unitCents * tr.qty;
    const baseTotal = variant.priceCents * tr.qty;
    const savings = Math.max(0, baseTotal - totalCents);
    const popularBadge = tr.isMostPopular
      ? `<span class="pumper-qb-popular-badge">${tWith(qb.textOverrides, "qb.mostPopular")}</span>`
      : "";
    const savingsBadge = savings > 0
      ? `<span class="pumper-qb-savings">${tWith(qb.textOverrides, "qb.savingsBadge", { savings: formatMoney(savings, config.settings.currency, config.settings.locale) })}</span>`
      : "";
    const classes = [
      "pumper-qb-tier",
      i === selectedIndex ? "pumper-qb-tier--selected" : "",
      tr.available ? "" : "pumper-qb-tier--unavailable",
    ].filter(Boolean).join(" ");
    return `
      <div class="${classes}" data-tier-index="${i}" data-action="select-tier" role="button" tabindex="0">
        ${popularBadge}
        <div class="pumper-qb-tier-meta">
          <div class="pumper-qb-tier-title">${escapeHtml(tWith(qb.textOverrides, "qb.tierLabel", { qty: tr.qty }))}${tr.discountValue > 0 ? ` — ${escapeHtml(tr.label)}` : ""}</div>
          <div class="pumper-qb-tier-sub">
            ${tr.discountValue > 0
              ? `<span class="pumper-strike">${formatMoney(variant.priceCents, config.settings.currency, config.settings.locale)}</span> `
              : ""}<strong>${formatMoney(unitCents, config.settings.currency, config.settings.locale)}</strong> each · ${formatMoney(totalCents, config.settings.currency, config.settings.locale)} total
          </div>
        </div>
        ${savingsBadge}
        ${renderGiftBadges(tr, qb.textOverrides)}
      </div>
    `;
  }).join("");

  const renderCta = () => {
    const tr = qb.tiers[selectedIndex]!;
    const unitCents = tierUnitCents(tr, variant.priceCents);
    const savings = Math.max(0, (variant.priceCents - unitCents) * tr.qty);
    const label = savings > 0
      ? (qb.ctaLabel || t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) }))
      : (qb.ctaLabel || t("qb.cta", { qty: tr.qty }));
    return `<button class="pumper-cta" data-action="add-to-cart" ${tr.available ? "" : "disabled"}>${escapeHtml(label)}</button>`;
  };

  const renderAll = () => {
    mount.innerHTML = `
      <section class="pumper-card pumper-qb">
        <h3 class="pumper-qb-heading">${escapeHtml(heading)}</h3>
        <div class="pumper-qb-tiers">${renderRows()}</div>
        ${renderCta()}
      </section>
    `;
    bindHandlers();
  };

  function bindHandlers() {
    mount.querySelectorAll<HTMLElement>("[data-action=select-tier]").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.tierIndex!, 10);
        if (qb.tiers[idx]?.available === false) return;
        selectedIndex = idx;
        emit("widget_click", { widgetType: "qb", widgetId: qb.id, productId: qb.productId, tierQty: qb.tiers[idx]!.qty });
        renderAll();
      });
    });

    const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
    if (cta) {
      cta.addEventListener("click", async () => {
        if (!variant) return; // narrowing for async closure (variant is checked at top of renderQb)
        const tr = qb.tiers[selectedIndex]!;
        cta.disabled = true;
        const unitCents = tierUnitCents(tr, variant.priceCents);

        const lines: CartLineInput[] = [
          { variantId: variant.variantId, qty: tr.qty, bundleId: qb.id },
        ];

        if (tr.freeGiftVariantId && tr.freeGiftAvailable !== false) {
          lines.push({
            variantId: tr.freeGiftVariantId,
            qty: 1,
            bundleId: qb.id,
            giftBundleId: qb.id,
          });
        }

        if (tr.bogo
            && (tr.bogo.mode === "add_same" || tr.bogo.mode === "add_different")
            && tr.bogo.targetVariantId
            && tr.bogo.targetAvailable !== false) {
          lines.push({
            variantId: tr.bogo.targetVariantId,
            qty: tr.bogo.bonusQty,
            bundleId: qb.id,
            giftBundleId: qb.id,
          });
        }
        // bogo.mode === "nth_free" → no extra line; Discount Function handles the math.

        // Pack QB extras — tier-attached bundled products.
        if (tr.extraProducts) {
          for (const ep of tr.extraProducts) {
            if (!ep.variantId) continue;
            lines.push({
              variantId: ep.variantId,
              qty: ep.qty,
              bundleId: qb.id,
            });
          }
        }

        const result = await addToCart(qb.id, lines);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
        } else {
          emit("add_to_cart", { widgetType: "qb", widgetId: qb.id, valueCents: unitCents * tr.qty });
        }
      });
    }
  }

  emit("widget_impression", { widgetType: "qb", widgetId: qb.id, productId: qb.productId });
  renderAll();
}
