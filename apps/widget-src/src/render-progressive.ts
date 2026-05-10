import type { ProgressiveGiftConfig, ProgressiveGiftThreshold } from "./types";
import { addToCart } from "./add-to-cart";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type CartItem = {
  key?: string;
  variant_id?: number;
  quantity?: number;
  properties?: Record<string, string> | null;
};
type CartShape = {
  items_subtotal_price?: number;
  total_price?: number;
  items?: CartItem[];
};

async function fetchCart(): Promise<CartShape | null> {
  try {
    const res = await fetch("/cart.js", { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as CartShape;
  } catch {
    return null;
  }
}

async function removeCartLine(key: string): Promise<boolean> {
  try {
    const res = await fetch("/cart/change.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: key, quantity: 0 }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Strip claimed gift lines that no longer qualify (cart subtotal dropped below
 * the threshold after the customer removed items). Returns true if any line
 * was removed so the caller can re-fetch the cart before rendering.
 */
async function pruneOrphanGifts(
  pg: ProgressiveGiftConfig,
  cart: CartShape | null,
): Promise<boolean> {
  if (!cart?.items || cart.items.length === 0) return false;
  // Compute the *gift-free* subtotal first — claimed gifts have a cart-line
  // total of 0 anyway (100% off applied at checkout, not in cart), so the
  // raw items_subtotal_price is what determines whether the threshold is met.
  const subtotal = cart.items_subtotal_price ?? cart.total_price ?? 0;
  let removedAny = false;
  for (const item of cart.items) {
    const tag = item.properties?._pumper_gift_id;
    if (!tag || !tag.startsWith(`${pg.id}:`)) continue;
    const idx = parseInt(tag.split(":")[1] ?? "", 10);
    const tier = pg.thresholds[idx];
    if (!tier) continue;
    if (subtotal >= tier.minSpendCents) continue; // still qualifies
    if (!item.key) continue;
    const ok = await removeCartLine(item.key);
    if (ok) removedAny = true;
  }
  return removedAny;
}

function alreadyClaimed(cart: CartShape | null, pgId: string, thresholdIdx: number): boolean {
  if (!cart?.items) return false;
  const tag = `${pgId}:${thresholdIdx}`;
  return cart.items.some((it) => it.properties?._pumper_gift_id === tag);
}

function applyVars(target: HTMLElement, pg: ProgressiveGiftConfig): void {
  const s = pg.styleOverrides ?? {};
  const set = (name: string, value: string | number | undefined): void => {
    if (value === undefined || value === null || value === "") return;
    target.style.setProperty(name, typeof value === "number" ? `${value}px` : value);
  };
  set("--pg-bg", s.backgroundColor);
  set("--pg-border", s.borderColor);
  set("--pg-heading", s.headingColor);
  set("--pg-text", s.textColor);
  set("--pg-fill", s.progressFill);
  set("--pg-track", s.progressTrack);
  set("--pg-card-bg", s.cardBg);
  set("--pg-card-border", s.cardBorder);
  set("--pg-card-bg-inactive", s.cardBgInactive);
  set("--pg-card-border-inactive", s.cardBorderInactive);
  set("--pg-badge-bg", s.badgeBg);
  set("--pg-badge-bg-inactive", s.badgeBgInactive);
  set("--pg-badge-text", s.badgeText);
  set("--pg-radius", s.borderRadius);
  set("--pg-pad-x", s.paddingX);
  set("--pg-pad-y", s.paddingY);
}

function deriveTitleAndStrike(tr: ProgressiveGiftThreshold, remaining: number): {
  title: string;
  lockedTitle: string;
  strike: string;
} {
  const isShipping = tr.kind === "free_shipping";
  const productTitle = tr.productTitle && tr.productTitle.length > 0 ? tr.productTitle : null;
  const defaultTitle = isShipping ? "Free shipping" : (productTitle ?? "Free gift");
  const firstPrice = tr.variants[0]?.priceCents;
  const autoStrike = !isShipping && firstPrice ? fmtMoney(firstPrice) : "";
  const customTitle = tr.title && tr.title.length > 0 ? tr.title : null;
  const customLockedTitle = tr.lockedTitle && tr.lockedTitle.length > 0 ? tr.lockedTitle : null;
  const customStrike = tr.labelCrossedOut && tr.labelCrossedOut.length > 0 ? tr.labelCrossedOut : null;
  return {
    title: customTitle ?? defaultTitle,
    lockedTitle: customLockedTitle ?? `Spend ${fmtMoney(remaining)} to unlock`,
    strike: customStrike ?? autoStrike,
  };
}

function renderTier(
  pg: ProgressiveGiftConfig,
  tr: ProgressiveGiftThreshold,
  i: number,
  cartSubtotalCents: number,
  cart: CartShape | null,
): string {
  const unlocked = cartSubtotalCents >= tr.minSpendCents;
  const remaining = Math.max(0, tr.minSpendCents - cartSubtotalCents);
  const { title, lockedTitle, strike } = deriveTitleAndStrike(tr, remaining);
  const isShipping = tr.kind === "free_shipping";
  const claimed = !isShipping && alreadyClaimed(cart, pg.id, i);

  const showBadge = unlocked || pg.showLockedLabels;
  const customLockedLabel = tr.lockedLabel && tr.lockedLabel.length > 0 ? tr.lockedLabel : null;
  const lockedLabel = customLockedLabel ?? `$${(tr.minSpendCents / 100).toFixed(0)}`;
  const customLabel = tr.label && tr.label.length > 0 ? tr.label : "FREE";
  const badgeContent = `${escapeHtml(unlocked ? customLabel : lockedLabel)}${
    strike ? ` <span class="pg-strike">${escapeHtml(strike)}</span>` : ""
  }`;

  const imageHtml = isShipping
    ? (tr.iconUrl
        ? `<img class="pg-img" src="${escapeHtml(tr.iconUrl)}" alt="" />`
        : `<div class="pg-img pg-img-emoji">🚚</div>`)
    : (tr.productImage
        ? `<img class="pg-img" src="${escapeHtml(tr.productImage)}" alt="" />`
        : `<div class="pg-img pg-img-empty"></div>`);

  const availVariants = tr.variants.filter((v) => v.available);
  const showVariantSelect = !isShipping && tr.variants.length > 1;

  // Action area
  let actionHtml = "";
  if (!isShipping && unlocked && !claimed) {
    if (availVariants.length === 0) {
      actionHtml = `<span class="pg-oos">Out of stock</span>`;
    } else {
      const select = showVariantSelect
        ? `<select class="pg-variant" data-pg-variant-select>
             ${tr.variants.map((v) => `<option value="${escapeHtml(v.variantId)}" ${!v.available ? "disabled" : ""}>${escapeHtml(v.title)}${!v.available ? " (out of stock)" : ""}</option>`).join("")}
           </select>`
        : "";
      actionHtml = `${select}<button class="pg-claim" data-pg-claim>Claim</button>`;
    }
  } else if (claimed) {
    actionHtml = `<span class="pg-claimed">✓ Claimed</span>`;
  } else if (isShipping && unlocked) {
    actionHtml = `<span class="pg-claimed">✓ Applied at checkout</span>`;
  }

  const statusPill = unlocked
    ? `<span class="pg-status pg-status--unlocked">● Unlocked</span>`
    : `<span class="pg-status pg-status--locked">○ Locked</span>`;

  return `
    <div class="pg-tier${unlocked ? " pg-tier--unlocked" : " pg-tier--locked"}" data-pg-tier="${i}">
      ${imageHtml}
      <div class="pg-tier-meta">
        <div class="pg-tier-title">${escapeHtml(unlocked ? title : lockedTitle)}</div>
      </div>
      ${statusPill}
      ${showBadge ? `<div class="pg-badge">${badgeContent}</div>` : ""}
      ${actionHtml ? `<div class="pg-action">${actionHtml}</div>` : ""}
    </div>
  `;
}

async function rerender(mount: HTMLElement, pg: ProgressiveGiftConfig): Promise<void> {
  let cart = await fetchCart();
  // If the customer dropped below a threshold after claiming, strip those
  // gift lines so they don't ride along uncovered.
  if (cart && await pruneOrphanGifts(pg, cart)) {
    cart = await fetchCart();
    document.dispatchEvent(new CustomEvent("cart:refresh"));
  }
  const cartSubtotalCents = cart?.items_subtotal_price ?? cart?.total_price ?? 0;

  const tiers = [...pg.thresholds].sort((a, b) => a.minSpendCents - b.minSpendCents);
  const visible = pg.hideLocked
    ? tiers.filter((tr, i) => cartSubtotalCents >= tr.minSpendCents || (i === 0 && cartSubtotalCents < tr.minSpendCents))
    : tiers;

  const nextLocked = tiers.find((tr) => cartSubtotalCents < tr.minSpendCents);
  const remaining = nextLocked ? Math.max(0, nextLocked.minSpendCents - cartSubtotalCents) : 0;
  const maxSpend = tiers[tiers.length - 1]?.minSpendCents ?? 0;
  const pct = maxSpend > 0 ? Math.min(100, (cartSubtotalCents / maxSpend) * 100) : 0;

  const subtitle = nextLocked
    ? `Spend ${fmtMoney(remaining)} more to unlock ${(nextLocked.title ?? nextLocked.productTitle ?? "the next gift")}`
    : tiers.length > 0 ? "All gifts unlocked!" : "";

  mount.innerHTML = `
    <div class="pg-card">
      <div class="pg-heading">${escapeHtml(pg.headline ?? "🎁 Unlock free gifts with your order")}</div>
      ${pg.subtitle ? `<div class="pg-sub">${escapeHtml(pg.subtitle)}</div>` : ""}
      <div class="pg-sub">${escapeHtml(subtitle)}</div>
      <div class="pg-progress"><div class="pg-progress-fill" style="width:${pct}%"></div></div>
      <div class="pg-tiers pg-layout--${pg.layout}">
        ${visible.map((tr) => renderTier(pg, tr, tiers.indexOf(tr), cartSubtotalCents, cart)).join("")}
      </div>
    </div>
  `;

  bindClaimHandlers(mount, pg, cartSubtotalCents);
}

function bindClaimHandlers(mount: HTMLElement, pg: ProgressiveGiftConfig, cartSubtotalCents: number): void {
  mount.querySelectorAll<HTMLElement>(".pg-tier").forEach((tierEl) => {
    const idxAttr = tierEl.getAttribute("data-pg-tier");
    if (!idxAttr) return;
    const i = parseInt(idxAttr, 10);
    const tr = pg.thresholds[i];
    if (!tr || tr.kind !== "free_gift") return;
    if (cartSubtotalCents < tr.minSpendCents) return;

    const btn = tierEl.querySelector<HTMLButtonElement>("[data-pg-claim]");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const select = tierEl.querySelector<HTMLSelectElement>("[data-pg-variant-select]");
      const chosenVariant = select?.value
        || tr.giftVariantId
        || tr.variants.find((v) => v.available)?.variantId
        || tr.variants[0]?.variantId;
      if (!chosenVariant) return;

      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "...";

      const giftTag = `${pg.id}:${i}`;
      const result = await addToCart(pg.id, [{
        variantId: chosenVariant,
        qty: 1,
        bundleId: pg.id,
        giftBundleId: giftTag,
        extraProperties: { _pumper_progressive: "1" },
      }]);

      if (!result.ok) {
        btn.disabled = false;
        btn.textContent = original ?? "Claim";
        const err = document.createElement("div");
        err.className = "pg-error";
        err.textContent = "Couldn't claim — try again";
        tierEl.appendChild(err);
        setTimeout(() => err.remove(), 2500);
      } else {
        // Re-render to flip to "Claimed"
        void rerender(mount, pg);
      }
    });
  });
}

export function renderProgressive(mount: HTMLElement, pg: ProgressiveGiftConfig): void {
  applyVars(mount, pg);
  void rerender(mount, pg);

  // Refresh on cart-change events from drawers / theme cart updates
  const handler = () => { void rerender(mount, pg); };
  document.addEventListener("cart:refresh", handler);
  document.addEventListener("cart:update", handler);
}
