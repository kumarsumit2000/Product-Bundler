import type { QbConfig, QbTier, WidgetConfig } from "./types";
import { addToCart } from "./add-to-cart";
import type { CartLineInput } from "./add-to-cart";
import { createPurchaseOptions } from "./render-purchase-options";
import type { PurchaseOptions, PurchaseSelection } from "./render-purchase-options";
import { emit } from "./analytics";
import { formatMoney } from "./format";
import { roundCharmCents } from "./round-charm";
import { findProductForm, syncThemeQuantity, bindThemeAddToCart } from "./theme-atc";
import { t, tWith } from "./i18n";

const INERT_PURCHASE_OPTIONS: PurchaseOptions = {
  active: false,
  getSelection: () => ({ mode: "onetime", sellingPlanId: null }),
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderGiftCallout(tier: QbTier, textOverrides: Record<string, string> | null | undefined): string {
  const lines: Array<{ text: string; unavailable: boolean }> = [];

  if (tier.freeGiftVariantId) {
    if (tier.freeGiftAvailable === false) {
      lines.push({ text: t("qb.giftBadgeUnavailable"), unavailable: true });
    } else {
      lines.push({
        text: tWith(textOverrides, "qb.giftBadge", { variantTitle: tier.freeGiftVariantTitle ?? "gift" }),
        unavailable: false,
      });
    }
  }

  if (tier.bogo) {
    const b = tier.bogo;
    if (b.mode === "nth_free") {
      const paidQty = Math.max(0, tier.qty - b.bonusQty);
      lines.push({ text: t("qb.bogoNthFree", { qty: tier.qty, paidQty }), unavailable: false });
    } else if (b.mode === "add_same") {
      if (b.targetAvailable === false) {
        lines.push({ text: t("qb.giftBadgeUnavailable"), unavailable: true });
      } else {
        const text = b.bonusQty === 1
          ? t("qb.bogoSameOne")
          : t("qb.bogoSameMany", { n: b.bonusQty });
        lines.push({ text, unavailable: false });
      }
    } else if (b.mode === "add_different") {
      if (b.targetAvailable === false) {
        lines.push({ text: t("qb.giftBadgeUnavailable"), unavailable: true });
      } else {
        lines.push({ text: t("qb.bogoDifferent", { variantTitle: b.targetVariantTitle ?? "gift" }), unavailable: false });
      }
    }
  }

  if (lines.length === 0) return "";
  return lines.map((l) => `<div class="pumper-qb-tier-gift${l.unavailable ? " pumper-qb-tier-gift--unavailable" : ""}">${escapeHtml(l.text)}</div>`).join("");
}

function tierUnitCents(tier: QbTier, basePriceCents: number): number {
  if (tier.discountType === "percentage") return Math.round(basePriceCents * (1 - tier.discountValue / 100));
  if (tier.discountType === "flat") return Math.max(0, basePriceCents - Math.round(tier.discountValue * 100));
  if (tier.discountType === "fixed_per_unit") return Math.max(0, Math.round(tier.discountValue * 100));
  return basePriceCents;
}

export function renderQb(mount: HTMLElement, qb: QbConfig, config: WidgetConfig): void {
  // When the QB is configured to follow the current PDP product, pull product
  // info from the App Embed's globals instead of the QB's bound product. This
  // is what powers universal "10% off 2, 20% off 5" templates that work on
  // every PDP without one row per product.
  const followCurrent = qb.bindToCurrentProduct === true;
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
    qb = {
      ...qb,
      productId: pdpProductId,
      productTitle: pdpTitle ?? qb.productTitle,
      productImage: pdpImage ?? qb.productImage,
      productVariants: pdpVariants,
    };
  }

  const variant = qb.productVariants.find((v) => v.available) ?? qb.productVariants[0];
  if (!variant || qb.productVariants.every((v) => !v.available)) {
    mount.innerHTML = "";
    mount.style.minHeight = "";
    return;
  }

  // Phase A: a tier with enabled === false is excluded from the widget.
  // Absent enabled = enabled (backward compatible). All rendering and
  // selection below operates on visibleTiers so a disabled tier can never
  // be shown or selected.
  const visibleTiers = qb.tiers.filter((t) => t.enabled !== false);

  // A tier is unavailable when it's out of stock OR manually marked sold out.
  const tierUnavailable = (tr: QbTier) => tr.soldOut === true || tr.available === false;
  let selectedIndex = visibleTiers.findIndex((tr) => !tierUnavailable(tr));
  if (selectedIndex < 0) selectedIndex = 0;

  // Theme add-to-cart integration: in the live storefront we drive the theme's
  // native product form instead of rendering our own CTA. In the admin preview
  // iframe there's no theme form, so we skip it.
  const isPreview = typeof window !== "undefined" && !!(window as unknown as { _pumperPreview?: boolean })._pumperPreview;
  const themeForm = isPreview ? null : findProductForm(mount);

  const heading = qb.headline || config.settings.qbHeadline || t("qb.heading");

  // Subscribe & Save purchase options. The whole mount is rewritten on every
  // tier click (renderAll), so the controller is re-created after each render
  // into a dedicated slot inside the card. We persist the user's One-time vs
  // Subscribe choice (and chosen plan) across those re-creations via a closure
  // so switching tiers doesn't reset it. `purchaseOptions` is the live handle
  // the add-to-cart click reads. When subscription is disabled it stays inert.
  const subEnabled = qb.subscription?.enabled === true;
  let purchaseOptions: PurchaseOptions = INERT_PURCHASE_OPTIONS;
  let savedSelection: PurchaseSelection = { mode: "onetime", sellingPlanId: null };

  const mountPurchaseOptions = () => {
    if (!subEnabled || !qb.subscription) {
      purchaseOptions = INERT_PURCHASE_OPTIONS;
      return;
    }
    const slot = mount.querySelector<HTMLElement>(".pumper-qb-po");
    if (!slot) {
      purchaseOptions = INERT_PURCHASE_OPTIONS;
      return;
    }
    const pumper = typeof window !== "undefined" ? window._pumperConfig : undefined;
    const subGroups = pumper?.sellingPlanGroups ?? [];
    const subAllocations =
      pumper?.productVariants?.find((v) => v.variantId === variant.variantId)?.sellingPlanAllocations ?? [];

    purchaseOptions = createPurchaseOptions(slot, qb.subscription, {
      groups: subGroups,
      allocations: subAllocations,
      oneTimePriceCents: variant.priceCents,
      currency: config.settings.currency,
      locale: config.settings.locale,
    });

    // Restore the previously chosen mode/plan after a re-create so the user's
    // selection survives tier switches. createPurchaseOptions has no initial-
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

  const renderRows = () => visibleTiers.map((tr, i) => {
    const unavailable = tierUnavailable(tr);
    let unitCents = tierUnitCents(tr, variant.priceCents);
    if (tr.priceRounding != null) unitCents = roundCharmCents(unitCents, tr.priceRounding);
    const totalCents = unitCents * tr.qty;
    const baseTotal = variant.priceCents * tr.qty;
    const savings = Math.max(0, baseTotal - totalCents);
    const discountPercent = variant.priceCents > 0 ? Math.round((1 - unitCents / variant.priceCents) * 100) : 0;
    const savingsFormatted = formatMoney(savings, config.settings.currency, config.settings.locale);
    const tierVars = { qty: tr.qty, DiscountPercentage: discountPercent, DiscountAmountTotal: savingsFormatted };
    const popularHidden = qb.textOverrides?.["qb.mostPopular.hidden"] === "1";
    const popularBadge = tr.isMostPopular && !popularHidden
      ? `<span class="pumper-qb-popular-badge">${tWith(qb.textOverrides, "qb.mostPopular")}</span>`
      : "";
    const badgeText = savings > 0 ? (tr.label.trim() || `${discountPercent}% OFF`) : t("qb.standardPrice");
    const tierImage = tr.image
      ? `<img class="pumper-qb-tier-img" src="${escapeHtml(tr.image)}" alt="" loading="lazy" />`
      : "";
    const freeShipBadge = tr.freeShipping
      ? `<span class="pumper-qb-freeship">${escapeHtml(t("qb.freeShipping"))}</span>`
      : "";
    const soldOutLabel = unavailable
      ? `<span class="pumper-qb-soldout">${escapeHtml(t("qb.soldOut"))}</span>`
      : "";
    const classes = [
      "pumper-qb-tier",
      i === selectedIndex ? "pumper-qb-tier--selected" : "",
      savings > 0 ? "pumper-qb-tier--discount" : "",
      unavailable ? "pumper-qb-tier--unavailable" : "",
    ].filter(Boolean).join(" ");

    const extras = (tr.extraProducts ?? []).filter((p) => p.title || p.image);
    const extrasRow = extras.length > 0
      ? `<div class="pumper-qb-tier-extras">
          ${extras.map((ep) => {
            const img = ep.image
              ? `<img src="${escapeHtml(ep.image)}" alt="" class="pumper-qb-extra-img" loading="lazy" />`
              : `<span class="pumper-qb-extra-img pumper-qb-extra-img--empty"></span>`;
            const qty = ep.qty && ep.qty > 1 ? `<span class="pumper-qb-extra-qty">×${ep.qty}</span>` : "";
            return `<span class="pumper-qb-extra">${img}<span class="pumper-qb-extra-title">${escapeHtml(ep.title ?? "")}</span>${qty}</span>`;
          }).join("")}
        </div>`
      : "";

    const giftCallout = renderGiftCallout(tr, qb.textOverrides);

    // QB-level free gift inline callout — shows inside any tier card whose
    // qty meets the QB-wide freeGiftMinQty so the customer can see which
    // tier unlocks the gift before they pick.
    const qbGiftMinQty = qb.freeGiftMinQty ?? 1;
    const hasQbGift = !!(qb.freeGiftVariantId || qb.freeGiftProductId);
    const qbGiftUnlockedHere = hasQbGift && tr.qty >= qbGiftMinQty;
    const qbCalloutHidden = qb.textOverrides?.["qb.freeGiftCallout.hidden"] === "1";
    const qbGiftCallout = qbGiftUnlockedHere && !qbCalloutHidden
      ? `<div class="pumper-qb-tier-gift">${escapeHtml(tWith(qb.textOverrides, "qb.freeGiftCallout"))}</div>`
      : "";

    return `
      <div class="${classes}" data-tier-index="${i}" data-action="select-tier" role="button" tabindex="0">
        ${popularBadge}
        <div class="pumper-qb-tier-row">
          <span class="pumper-qb-radio" aria-hidden="true"></span>
          ${tierImage}
          <div class="pumper-qb-tier-meta">
            <div class="pumper-qb-tier-title">${escapeHtml(tWith(qb.textOverrides, "qb.tierLabel", tierVars))}<span class="pumper-qb-tier-badge">${escapeHtml(badgeText)}</span></div>
            ${soldOutLabel || freeShipBadge ? `<div class="pumper-qb-tier-subbadges">${soldOutLabel}${freeShipBadge}</div>` : ""}
          </div>
          <div class="pumper-qb-tier-price">
            <span class="pumper-qb-price-total">${formatMoney(totalCents, config.settings.currency, config.settings.locale)}</span>
            ${savings > 0 ? `<span class="pumper-qb-price-strike">${formatMoney(baseTotal, config.settings.currency, config.settings.locale)}</span>` : ""}
          </div>
        </div>
        ${extrasRow}
        ${giftCallout}
        ${qbGiftCallout}
      </div>
    `;
  }).join("");

  // Build the exact cart lines for a given tier: main product variant +
  // free gift + QB-level free gift + BOGO bonus + tier extras. This is the
  // single source of truth for the cart payload, shared by the theme-driven
  // add-to-cart path (extras interception) and the hasExtras check.
  const buildTierLines = (tr: (typeof visibleTiers)[number]): CartLineInput[] => {
    const poSel = purchaseOptions.getSelection();
    const lines: CartLineInput[] = [
      { variantId: variant.variantId, qty: tr.qty, bundleId: qb.id, sellingPlanId: poSel.sellingPlanId ?? undefined },
    ];

    if (tr.freeGiftVariantId && tr.freeGiftAvailable !== false) {
      lines.push({
        variantId: tr.freeGiftVariantId,
        qty: 1,
        bundleId: qb.id,
        giftBundleId: qb.id,
      });
    }

    // QB-level free gift — only when the selected tier meets the min qty
    // threshold ("Buy N or more to unlock the gift").
    const qbGiftTag = `${qb.id}:gift`;
    const qbGiftMinQty = qb.freeGiftMinQty ?? 1;
    const qbGiftUnlocked = tr.qty >= qbGiftMinQty;
    if (qbGiftUnlocked && qb.freeGiftVariantId && qb.freeGiftAvailable) {
      lines.push({
        variantId: qb.freeGiftVariantId,
        qty: 1,
        bundleId: qb.id,
        giftBundleId: qbGiftTag,
      });
    } else if (qbGiftUnlocked && qb.freeGiftProductId && (qb.freeGiftProductVariants?.length ?? 0) > 0) {
      const giftVariants = qb.freeGiftProductVariants ?? [];
      const giftSelect = mount.querySelector<HTMLSelectElement>("[data-pumper-qb-gift-variant]");
      const chosenGift = giftSelect?.value
        || giftVariants.find((v) => v.available)?.variantId
        || giftVariants[0]?.variantId;
      if (chosenGift) {
        lines.push({
          variantId: chosenGift,
          qty: 1,
          bundleId: qb.id,
          giftBundleId: qbGiftTag,
        });
      }
    }

    if (tr.bogo) {
      if (tr.bogo.mode === "add_same") {
        // Bonus = N more of the SAME variant the customer is buying.
        // targetVariantId is optional; fall back to the QB's main variant.
        const target = tr.bogo.targetVariantId ?? variant.variantId;
        lines.push({
          variantId: target,
          qty: tr.bogo.bonusQty,
          bundleId: qb.id,
          giftBundleId: qb.id,
        });
      } else if (
        tr.bogo.mode === "add_different"
        && tr.bogo.targetVariantId
        && tr.bogo.targetAvailable !== false
      ) {
        lines.push({
          variantId: tr.bogo.targetVariantId,
          qty: tr.bogo.bonusQty,
          bundleId: qb.id,
          giftBundleId: qb.id,
        });
      }
      // bogo.mode === "nth_free" → no extra line; Discount Function handles the math.
    }

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

    return lines;
  };

  const tierHasExtraLines = (tr: (typeof visibleTiers)[number]): boolean =>
    buildTierLines(tr).length > 1;

  const renderUpsells = () => {
    if (!qb.checkboxUpsellsEnabled || !qb.checkboxUpsells?.length) return "";
    const cards = qb.checkboxUpsells
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

  const renderQbGiftRow = (): string => {
    const minQty = qb.freeGiftMinQty ?? 1;
    const selectedTier = visibleTiers[selectedIndex];
    const unlocked = !!selectedTier && selectedTier.qty >= minQty;
    const buildLockedNote = () => {
      const remaining = minQty - (selectedTier?.qty ?? 0);
      const noun = remaining === 1 ? "qty" : "qty";
      return `<div class="pumper-row-sub">Pick a tier with ${minQty}+ ${noun} to unlock${remaining > 0 ? ` (${remaining} more)` : ""}</div>`;
    };

    if (qb.freeGiftVariantId && qb.freeGiftAvailable) {
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift${unlocked ? "" : " pumper-bundle-row--gift-locked"}">
          <div class="pumper-thumb pumper-thumb-emoji">🎁</div>
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(qb.freeGiftVariantTitle ?? "Free gift")}</div>
            ${unlocked
              ? `<div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this offer</div>`
              : buildLockedNote()}
          </div>
        </div>
      `;
    }
    if (qb.freeGiftProductId && (qb.freeGiftProductVariants?.length ?? 0) > 0) {
      const variants = qb.freeGiftProductVariants ?? [];
      const hasAvailable = variants.some((v) => v.available);
      if (!hasAvailable) return "";
      const img = qb.freeGiftProductImage
        ? `<img src="${escapeHtml(qb.freeGiftProductImage)}" alt="" class="pumper-thumb" loading="lazy" />`
        : `<div class="pumper-thumb pumper-thumb-emoji">🎁</div>`;
      const select = variants.length > 1 && unlocked
        ? `<select class="pumper-gift-variant" data-pumper-qb-gift-variant>
             ${variants
               .map((v) => `<option value="${escapeHtml(v.variantId)}" ${!v.available ? "disabled" : ""}>${escapeHtml(v.title)}${!v.available ? " (out of stock)" : ""}</option>`)
               .join("")}
           </select>`
        : "";
      return `
        <div class="pumper-bundle-row pumper-bundle-row--gift${unlocked ? "" : " pumper-bundle-row--gift-locked"}">
          ${img}
          <div class="pumper-row-meta">
            <div class="pumper-row-title">${escapeHtml(qb.freeGiftProductTitle ?? "Free gift")}</div>
            ${unlocked
              ? `<div class="pumper-row-sub"><strong class="pumper-row-free">FREE</strong> with this offer</div>`
              : buildLockedNote()}
            ${select}
          </div>
        </div>
      `;
    }
    return "";
  };

  const renderCtas = () => {
    const tr = visibleTiers[selectedIndex];
    if (!tr || !variant) return "";
    const unitCents = tierUnitCents(tr, variant.priceCents);
    const savings = Math.max(0, (variant.priceCents - unitCents) * tr.qty);
    const atcLabel = qb.ctaLabel || (savings > 0
      ? t("qb.ctaSavings", { qty: tr.qty, savings: formatMoney(savings, config.settings.currency, config.settings.locale) })
      : t("qb.cta", { qty: tr.qty }));
    const disabled = tr.available ? "" : "disabled";
    const atc = qb.showAddToCart !== false
      ? `<button class="pumper-cta pumper-cta--atc" data-action="add-to-cart" ${disabled}>${escapeHtml(atcLabel)}</button>`
      : "";
    const buy = qb.showBuyNow
      ? `<button class="pumper-cta pumper-cta--buynow" data-action="buy-now" ${disabled}>${escapeHtml(t("qb.buyNow"))}</button>`
      : "";
    return atc + buy;
  };

  const renderAll = () => {
    const qbLayout = qb.styleOverrides?.layoutVariant;
    const qbCols = Math.min(qb.styleOverrides?.gridColumns ?? 3, visibleTiers.length || 1);
    const tiersClass = qbLayout === "grid" ? "pumper-qb-tiers pumper-qb-tiers--horizontal" : "pumper-qb-tiers";
    const tiersStyle = qbLayout === "grid" ? ` style="--pumper-qb-cols:${qbCols}"` : "";
    mount.innerHTML = `
      <section class="pumper-card pumper-qb">
        <h3 class="pumper-qb-heading">${escapeHtml(heading)}</h3>
        <div class="${tiersClass}"${tiersStyle}>${renderRows()}</div>
        ${renderQbGiftRow()}
        ${renderUpsells()}
        ${subEnabled ? `<div class="pumper-qb-po"></div>` : ""}
        ${renderCtas()}
      </section>
    `;
    mountPurchaseOptions();
    bindHandlers();
  };

  function bindHandlers() {
    const runAdd = async (btn: HTMLButtonElement, after: "drawer" | "cart" | "checkout" | undefined) => {
      if (!variant) return;
      btn.disabled = true;
      const tr = visibleTiers[selectedIndex]!;
      emit("add_to_cart", { widgetType: "qb", widgetId: qb.id, productId: qb.productId, tierQty: tr.qty });
      const res = await addToCart(qb.id, buildTierLines(tr), { afterAddToCart: after });
      if (!res.ok) btn.disabled = false;
    };
    mount.querySelector<HTMLButtonElement>("[data-action=add-to-cart]")
      ?.addEventListener("click", (e) => runAdd(e.currentTarget as HTMLButtonElement, qb.afterAddToCart));
    mount.querySelector<HTMLButtonElement>("[data-action=buy-now]")
      ?.addEventListener("click", (e) => runAdd(e.currentTarget as HTMLButtonElement, "checkout"));

    mount.querySelectorAll<HTMLElement>("[data-action=select-tier]").forEach((row) => {
      row.addEventListener("click", () => {
        const idx = parseInt(row.dataset.tierIndex!, 10);
        const clicked = visibleTiers[idx];
        if (clicked && tierUnavailable(clicked)) return;
        selectedIndex = idx;
        // Persist the purchase-options choice across the re-render below.
        savedSelection = purchaseOptions.getSelection();
        syncThemeQuantity(themeForm, visibleTiers[idx]!.qty);
        emit("widget_click", { widgetType: "qb", widgetId: qb.id, productId: qb.productId, tierQty: visibleTiers[idx]!.qty });
        renderAll();
      });
    });
  }

  emit("widget_impression", { widgetType: "qb", widgetId: qb.id, productId: qb.productId });
  renderAll();

  syncThemeQuantity(themeForm, visibleTiers[selectedIndex]?.qty ?? 1);
  if (themeForm) {
    bindThemeAddToCart(themeForm, {
      hasExtras: () => tierHasExtraLines(visibleTiers[selectedIndex]!),
      addLines: () =>
        addToCart(qb.id, buildTierLines(visibleTiers[selectedIndex]!), { afterAddToCart: qb.afterAddToCart }).then(() => {}),
    });
  }
}
