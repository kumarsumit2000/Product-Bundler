import type { BxgyOfferConfig, BxgyBarConfig, WidgetConfig } from "./types";
import { addToCart, type CartLineInput } from "./add-to-cart";
import { createPurchaseOptions } from "./render-purchase-options";
import type { PurchaseOptions, PurchaseSelection } from "./render-purchase-options";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { t, tWith } from "./i18n";

const INERT_PURCHASE_OPTIONS: PurchaseOptions = {
  active: false,
  getSelection: () => ({ mode: "onetime", sellingPlanId: null }),
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

type BarMath = {
  fullPriceCents: number;
  paidCents: number;
  savingsCents: number;
  savingsPercent: number;
  totalUnits: number;
};

function computeBarMath(bar: BxgyBarConfig, unitPriceCents: number): BarMath {
  const totalUnits = bar.buyQty + bar.getQty;
  const fullPriceCents = unitPriceCents * totalUnits;
  const buyPaid = unitPriceCents * (1 - bar.buyDiscountPercent / 100) * bar.buyQty;
  const getPaid = unitPriceCents * (1 - bar.getDiscountPercent / 100) * bar.getQty;
  const paidCents = Math.round(buyPaid + getPaid);
  const savingsCents = Math.max(0, fullPriceCents - paidCents);
  const savingsPercent = fullPriceCents > 0 ? Math.round((savingsCents / fullPriceCents) * 100) : 0;
  return { fullPriceCents, paidCents, savingsCents, savingsPercent, totalUnits };
}

function renderBadge(bar: BxgyBarConfig, math: BarMath, currency: string, locale: string): string {
  if (bar.badgeStyle === "none") return "";
  let text = bar.badgeText || "SAVE {{saved_percentage}}";
  text = text
    .replace(/\{\{saved_percentage\}\}/g, `${math.savingsPercent}%`)
    .replace(/\{\{saved_amount\}\}/g, formatMoney(math.savingsCents, currency, locale));
  return `<span class="pumper-qb-savings">${escapeHtml(text)}</span>`;
}

export function renderBxgy(mount: HTMLElement, offer: BxgyOfferConfig, config: WidgetConfig): void {
  // Follow current PDP product when the offer is configured for it. Same
  // pattern as render-qb so universal BXGY templates work site-wide.
  const followCurrent = offer.bindToCurrentProduct === true;
  const pdpProductId = window._pumperConfig?.productId;
  const pdpVariants = window._pumperConfig?.productVariants;
  const pdpTitle = window._pumperConfig?.productTitle;
  const pdpImage = window._pumperConfig?.productImage ?? null;
  if (followCurrent) {
    if (!pdpProductId || !pdpVariants || pdpVariants.length === 0) {
      mount.innerHTML = "";
      mount.style.minHeight = "";
      return;
    }
    offer = {
      ...offer,
      productId: pdpProductId,
      productTitle: pdpTitle ?? offer.productTitle,
      productImage: pdpImage ?? offer.productImage,
      productVariants: pdpVariants,
    };
  }

  const variant = offer.productVariants.find((v) => v.available) ?? offer.productVariants[0];
  if (!variant || offer.productVariants.every((v) => !v.available)) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    return;
  }

  const popularIndex = offer.bars.findIndex((b) => b.isMostPopular);
  let selectedIndex = popularIndex >= 0 ? popularIndex : 0;

  const heading = offer.headline || "Pick your deal";

  // Subscribe & Save purchase options. The whole mount is rewritten on every
  // bar click (renderAll), so the controller is re-created after each render
  // into a dedicated slot inside the card. We persist the user's One-time vs
  // Subscribe choice (and chosen plan) across those re-creations via a closure
  // so switching bars doesn't reset it. `purchaseOptions` is the live handle
  // the add-to-cart click reads. When subscription is disabled it stays inert.
  const subEnabled = offer.subscription?.enabled === true;
  let purchaseOptions: PurchaseOptions = INERT_PURCHASE_OPTIONS;
  let savedSelection: PurchaseSelection = { mode: "onetime", sellingPlanId: null };

  const mountPurchaseOptions = () => {
    if (!subEnabled || !offer.subscription) {
      purchaseOptions = INERT_PURCHASE_OPTIONS;
      return;
    }
    const slot = mount.querySelector<HTMLElement>(".pumper-bxgy-po");
    if (!slot) {
      purchaseOptions = INERT_PURCHASE_OPTIONS;
      return;
    }
    const pumper = typeof window !== "undefined" ? window._pumperConfig : undefined;
    const subGroups = pumper?.sellingPlanGroups ?? [];
    const subAllocations =
      pumper?.productVariants?.find((v) => v.variantId === variant.variantId)?.sellingPlanAllocations ?? [];

    purchaseOptions = createPurchaseOptions(slot, offer.subscription, {
      groups: subGroups,
      allocations: subAllocations,
      oneTimePriceCents: variant.priceCents,
      currency: config.settings.currency,
      locale: config.settings.locale,
    });

    // Restore the previously chosen mode/plan after a re-create so the user's
    // selection survives bar switches. createPurchaseOptions has no initial-
    // state arg, so we replay the choice by clicking the relevant row.
    if (purchaseOptions.active && savedSelection.mode === "subscribe") {
      slot.querySelector<HTMLElement>('[data-po-mode="subscribe"]')?.click();
      if (savedSelection.sellingPlanId) {
        const planSel = slot.querySelector<HTMLSelectElement>(".pumper-po-plan");
        if (planSel && planSel.value !== savedSelection.sellingPlanId) {
          const hasPlan = Array.from(planSel.options).some((o) => o.value === savedSelection.sellingPlanId);
          if (hasPlan) {
            planSel.value = savedSelection.sellingPlanId;
            planSel.dispatchEvent(new Event("change"));
          }
        }
      }
    }
  };

  const renderBars = () => offer.bars.map((bar, i) => {
    const math = computeBarMath(bar, variant.priceCents);
    const isSelected = i === selectedIndex;
    const popularBadge = bar.isMostPopular
      ? `<span class="pumper-qb-popular-badge">★ Most Popular</span>`
      : "";
    const savingsBadge = math.savingsCents > 0 ? renderBadge(bar, math, config.settings.currency, config.settings.locale) : "";
    const classes = ["pumper-qb-tier", isSelected ? "pumper-qb-tier--selected" : ""].filter(Boolean).join(" ");

    const giftMin = offer.freeGiftMinBuyQty ?? 1;
    const hasGift = !!(offer.freeGiftVariantId || offer.freeGiftProductId);
    const giftUnlockedHere = hasGift && bar.buyQty >= giftMin;
    const calloutHidden = offer.textOverrides?.["bxgy.freeGiftCallout.hidden"] === "1";
    const giftCallout = giftUnlockedHere && !calloutHidden
      ? `<div class="pumper-qb-tier-gift">${escapeHtml(tWith(offer.textOverrides ?? null, "bxgy.freeGiftCallout"))}</div>`
      : "";

    return `
      <div class="${classes}" data-bxgy-bar-index="${i}" data-action="select-bar" role="button" tabindex="0">
        ${popularBadge}
        <div class="pumper-qb-tier-row">
          <div class="pumper-qb-tier-meta">
            <div class="pumper-qb-tier-title">${escapeHtml(bar.title)}</div>
            <div class="pumper-qb-tier-sub">
              ${math.savingsCents > 0 ? `<span class="pumper-strike">${formatMoney(math.fullPriceCents, config.settings.currency, config.settings.locale)}</span> ` : ""}
              <strong>${formatMoney(math.paidCents, config.settings.currency, config.settings.locale)}</strong> for ${math.totalUnits} items
            </div>
            ${bar.subtitle ? `<div class="pumper-qb-tier-sub">${escapeHtml(bar.subtitle)}</div>` : ""}
          </div>
          ${savingsBadge}
        </div>
        ${giftCallout}
      </div>
    `;
  }).join("");

  const renderCta = () => {
    const bar = offer.bars[selectedIndex]!;
    const math = computeBarMath(bar, variant.priceCents);
    const label = offer.ctaLabel
      || (math.savingsCents > 0
        ? t("qb.ctaSavings", { qty: math.totalUnits, savings: formatMoney(math.savingsCents, config.settings.currency, config.settings.locale) })
        : t("qb.cta", { qty: math.totalUnits }));
    return `<button class="pumper-cta" data-action="add-to-cart">${escapeHtml(label)}</button>`;
  };

  const renderGiftRow = (): string => {
    const minBuyQty = offer.freeGiftMinBuyQty ?? 1;
    const selected = offer.bars[selectedIndex];
    const unlocked = !!selected && selected.buyQty >= minBuyQty;
    const lockedNote = `<div class="pumper-row-sub">Pick a bar with buy qty ${minBuyQty}+ to unlock</div>`;
    if (offer.freeGiftVariantId && offer.freeGiftAvailable) {
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift${unlocked ? "" : " pumper-bundle-row--gift-locked"}">
          <div class="pumper-thumb pumper-thumb-emoji">🎁</div>
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(offer.freeGiftVariantTitle ?? "Free gift")}</div>
            ${unlocked
              ? `<div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this offer</div>`
              : lockedNote}
          </div>
        </div>
      `;
    }
    if (offer.freeGiftProductId && (offer.freeGiftProductVariants?.length ?? 0) > 0) {
      const variants = offer.freeGiftProductVariants ?? [];
      if (!variants.some((v) => v.available)) return "";
      const img = offer.freeGiftProductImage
        ? `<img src="${escapeHtml(offer.freeGiftProductImage)}" alt="" class="pumper-thumb" loading="lazy" />`
        : `<div class="pumper-thumb pumper-thumb-emoji">🎁</div>`;
      const select = variants.length > 1 && unlocked
        ? `<select class="pumper-gift-variant" data-pumper-bxgy-gift-variant>
             ${variants.map((v) => `<option value="${escapeHtml(v.variantId)}" ${!v.available ? "disabled" : ""}>${escapeHtml(v.title)}${!v.available ? " (out of stock)" : ""}</option>`).join("")}
           </select>`
        : "";
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift${unlocked ? "" : " pumper-bundle-row--gift-locked"}">
          ${img}
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(offer.freeGiftProductTitle ?? "Free gift")}</div>
            ${unlocked
              ? `<div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this offer</div>`
              : lockedNote}
            ${select}
          </div>
        </div>
      `;
    }
    return "";
  };

  const renderUpsells = (): string => {
    if (!offer.checkboxUpsellsEnabled || !offer.checkboxUpsells?.length) return "";
    const cards = offer.checkboxUpsells
      .filter((u) => u.productId && u.productTitle)
      .map((u) => {
        const baseCents = u.productPriceCents ?? 0;
        const discountedCents = u.discountType === "percentage"
          ? Math.round(baseCents * (1 - u.discountValue / 100))
          : Math.max(0, baseCents - Math.round(u.discountValue * 100));
        const savedCents = Math.max(0, baseCents - discountedCents);
        const discountText = u.discountType === "percentage"
          ? `${u.discountValue}% off`
          : `${formatMoney(Math.round(u.discountValue * 100), config.settings.currency, config.settings.locale)} off`;
        const expand = (s: string) => s
          .replace(/\{\{product\}\}/g, escapeHtml(u.productTitle))
          .replace(/\{\{saved_amount\}\}/g, escapeHtml(formatMoney(savedCents, config.settings.currency, config.settings.locale)))
          .replace(/\{\{discount\}\}/g, escapeHtml(discountText));
        const img = u.productImage
          ? `<img src="${escapeHtml(u.productImage)}" alt="" class="pumper-upsell-img" />`
          : `<div class="pumper-upsell-img pumper-upsell-img-empty"></div>`;
        const priceLine = baseCents > 0
          ? `<span class="pumper-upsell-price">${formatMoney(discountedCents, config.settings.currency, config.settings.locale)}</span> <span class="pumper-strike">${formatMoney(baseCents, config.settings.currency, config.settings.locale)}</span>`
          : "";
        return `
          <label class="pumper-upsell" data-pumper-upsell="${escapeHtml(u.id)}">
            <input type="checkbox" class="pumper-upsell-check" />
            ${img}
            <div class="pumper-upsell-meta">
              <div class="pumper-upsell-title">${expand(u.title)}</div>
              ${u.subtitle ? `<div class="pumper-upsell-sub">${expand(u.subtitle)}</div>` : ""}
            </div>
            ${priceLine ? `<div class="pumper-upsell-pricing">${priceLine}</div>` : ""}
          </label>
        `;
      })
      .join("");
    if (!cards) return "";
    return `<div class="pumper-upsells">${cards}</div>`;
  };

  const renderAll = () => {
    mount.innerHTML = `
      <section class="pumper-card pumper-qb">
        <h3 class="pumper-qb-heading">${escapeHtml(heading)}</h3>
        <div class="pumper-qb-tiers">${renderBars()}</div>
        ${renderGiftRow()}
        ${renderUpsells()}
        ${subEnabled ? `<div class="pumper-bxgy-po"></div>` : ""}
        ${renderCta()}
      </section>
    `;
    mountPurchaseOptions();
    bindHandlers();
  };

  const bindHandlers = () => {
    mount.querySelectorAll<HTMLElement>("[data-action=select-bar]").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.bxgyBarIndex!, 10);
        selectedIndex = idx;
        // Persist the purchase-options choice across the re-render below.
        savedSelection = purchaseOptions.getSelection();
        emit("widget_click", { widgetType: "qb", widgetId: offer.id, productId: offer.productId });
        renderAll();
      });
    });

    const cta = mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]");
    if (cta) {
      cta.addEventListener("click", async () => {
        if (!variant) return;
        const bar = offer.bars[selectedIndex]!;
        cta.disabled = true;

        const poSel = purchaseOptions.getSelection();
        const lines: CartLineInput[] = [];
        // Buy block: separate line so the merchant sees it as the paid item.
        // Bound to a unique giftBundleId only when buy block has its own
        // discount > 0 — otherwise full-price line stays plain.
        if (bar.buyDiscountPercent > 0) {
          // Future: percentage-off via a per-line property the function can
          // read. For now we just push at full price and rely on the get
          // block to deliver the savings.
        }
        lines.push({
          variantId: variant.variantId,
          qty: bar.buyQty,
          bundleId: offer.id,
          sellingPlanId: poSel.sellingPlanId ?? undefined,
        });
        // Get block: 100% off via gift_attr. Different giftBundleId value
        // keeps it as a separate Shopify line item from the buy line, so the
        // merchant sees both quantities to fulfill.
        if (bar.getQty > 0) {
          lines.push({
            variantId: variant.variantId,
            qty: bar.getQty,
            bundleId: offer.id,
            giftBundleId: `${offer.id}:${bar.id}:get`,
            sellingPlanId: poSel.sellingPlanId ?? undefined,
          });
        }

        // Offer-level free gift — only when bar buyQty meets the threshold.
        const giftMin = offer.freeGiftMinBuyQty ?? 1;
        if (bar.buyQty >= giftMin) {
          const giftTag = `${offer.id}:gift`;
          if (offer.freeGiftVariantId && offer.freeGiftAvailable) {
            lines.push({
              variantId: offer.freeGiftVariantId, qty: 1, bundleId: offer.id, giftBundleId: giftTag,
            });
          } else if (offer.freeGiftProductId && (offer.freeGiftProductVariants?.length ?? 0) > 0) {
            const giftVariants = offer.freeGiftProductVariants ?? [];
            const giftSelect = mount.querySelector<HTMLSelectElement>("[data-pumper-bxgy-gift-variant]");
            const chosen = giftSelect?.value
              || giftVariants.find((v) => v.available)?.variantId
              || giftVariants[0]?.variantId;
            if (chosen) {
              lines.push({ variantId: chosen, qty: 1, bundleId: offer.id, giftBundleId: giftTag });
            }
          }
        }

        // Checkbox upsells — same pattern as QB.
        const upsellChecks = mount.querySelectorAll<HTMLInputElement>(".pumper-upsell-check");
        upsellChecks.forEach((cb, idx) => {
          if (!cb.checked) return;
          const u = offer.checkboxUpsells?.[idx];
          if (!u || !u.variantId) return;
          lines.push({
            variantId: u.variantId,
            qty: 1,
            bundleId: offer.id,
            giftBundleId: `${offer.id}:upsell:${u.id}`,
          });
        });

        const result = await addToCart(offer.id, lines);
        if (!result.ok) {
          cta.disabled = false;
          cta.textContent = t("addToCart.error");
          setTimeout(() => renderAll(), 2500);
        } else {
          const math = computeBarMath(bar, variant.priceCents);
          emit("add_to_cart", { widgetType: "qb", widgetId: offer.id, valueCents: math.paidCents });
        }
      });
    }
  };

  emit("widget_impression", { widgetType: "qb", widgetId: offer.id, productId: offer.productId });
  renderAll();
}
