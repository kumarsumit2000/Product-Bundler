import type { WidgetConfig, WidgetType, StyleOverrides } from "./types";
import { matchBundle, matchQb, matchMixMatch, matchBxgy } from "./match";
import { lookupBundle, lookupQb, lookupMixMatch, lookupBxgy } from "./lookup";
import { renderBundle } from "./render-bundle";
import { renderQb } from "./render-qb";
import { renderMixMatch } from "./render-mix-match";
import { renderBxgy } from "./render-bxgy";
import { renderProgressive } from "./render-progressive";
import { startStickyAtc } from "./render-sticky-atc";
import { hideThirdPartySubscriptionWidgets } from "./render-purchase-options";
import { configureAnalytics } from "./analytics";
import { setLocale } from "./i18n";

let cachedConfig: WidgetConfig | null = null;
let configPromise: Promise<WidgetConfig> | null = null;

async function fetchConfigOnce(shop: string, apiBase: string): Promise<WidgetConfig> {
  if (window._pumperPreview && window._pumperPreviewConfig) {
    return window._pumperPreviewConfig;
  }
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    const delays = [0, 200, 600, 1800];
    let lastErr: unknown;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]! > 0) await new Promise((r) => setTimeout(r, delays[i]!));
      try {
        const res = await fetch(`${apiBase}/config/${encodeURIComponent(shop)}`, { credentials: "omit" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WidgetConfig;
        cachedConfig = data;
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    configPromise = null;
    throw lastErr ?? new Error("config fetch failed");
  })();
  return configPromise;
}

function toGid(productIdRaw: string): string {
  if (productIdRaw.startsWith("gid://")) return productIdRaw;
  return `gid://shopify/Product/${productIdRaw}`;
}

const FONT_WEIGHT: Record<string, string> = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
};

function setVar(target: HTMLElement, name: string, value: string | number | undefined): void {
  if (value === undefined || value === null || value === "") return;
  target.style.setProperty(name, typeof value === "number" ? `${value}px` : value);
}

export function applyCssVars(
  target: HTMLElement,
  cfg: WidgetConfig,
  override: StyleOverrides | null,
): void {
  const s = cfg.settings;
  const o = override ?? {};

  // Legacy shorthand (still applies broadly to widget chrome)
  setVar(target, "--pumper-primary", o.primaryColor ?? s.primaryColor);
  setVar(target, "--pumper-text",    o.textColor    ?? s.textColor);
  setVar(target, "--pumper-bg",      o.backgroundColor ?? s.backgroundColor);
  target.style.setProperty("--pumper-radius",  `${o.borderRadius ?? s.borderRadius}px`);
  target.style.setProperty("--pumper-spacing", `${o.spacing ?? 6}px`);
  target.style.setProperty("--pumper-font",    s.fontFamily);

  // General
  setVar(target, "--pumper-cards-bg",         o.cardsBg);
  setVar(target, "--pumper-tier-bg",          o.tierBg);
  setVar(target, "--pumper-selected-bg",      o.selectedBg);
  setVar(target, "--pumper-border",           o.borderColor);
  setVar(target, "--pumper-block-title-color", o.blockTitleColor);

  // Bar texts
  setVar(target, "--pumper-title-color",      o.titleColor);
  setVar(target, "--pumper-subtitle-color",   o.subtitleColor);
  setVar(target, "--pumper-price-color",      o.priceColor);
  setVar(target, "--pumper-full-price-color", o.fullPriceColor);

  // Label
  setVar(target, "--pumper-label-bg",   o.labelBg);
  setVar(target, "--pumper-label-text", o.labelText);

  // Badge
  setVar(target, "--pumper-badge-bg",   o.badgeBg);
  setVar(target, "--pumper-badge-text", o.badgeText);

  // Free gift
  setVar(target, "--pumper-fg-bg",       o.freeGiftBg);
  setVar(target, "--pumper-fg-text",     o.freeGiftText);
  setVar(target, "--pumper-fg-sel-bg",   o.freeGiftSelectedBg);
  setVar(target, "--pumper-fg-sel-text", o.freeGiftSelectedText);

  // Upsell (vars set even though widget doesn't render an upsell yet)
  setVar(target, "--pumper-upsell-bg",       o.upsellBg);
  setVar(target, "--pumper-upsell-text",     o.upsellText);
  setVar(target, "--pumper-upsell-sel-bg",   o.upsellSelectedBg);
  setVar(target, "--pumper-upsell-sel-text", o.upsellSelectedText);

  // Typography — sizes in px, font-style enum mapped to CSS weight
  setVar(target, "--pumper-block-title-fs",  o.blockTitleFontSize);
  setVar(target, "--pumper-block-title-fw",  o.blockTitleFontStyle ? FONT_WEIGHT[o.blockTitleFontStyle] : undefined);
  setVar(target, "--pumper-title-fs",        o.titleFontSize);
  setVar(target, "--pumper-title-fw",        o.titleFontStyle ? FONT_WEIGHT[o.titleFontStyle] : undefined);
  setVar(target, "--pumper-subtitle-fs",     o.subtitleFontSize);
  setVar(target, "--pumper-subtitle-fw",     o.subtitleFontStyle ? FONT_WEIGHT[o.subtitleFontStyle] : undefined);
  setVar(target, "--pumper-label-fs",        o.labelFontSize);
  setVar(target, "--pumper-label-fw",        o.labelFontStyle ? FONT_WEIGHT[o.labelFontStyle] : undefined);
  setVar(target, "--pumper-fg-fs",           o.freeGiftFontSize);
  setVar(target, "--pumper-fg-fw",           o.freeGiftFontStyle ? FONT_WEIGHT[o.freeGiftFontStyle] : undefined);
  setVar(target, "--pumper-upsell-fs",       o.upsellFontSize);
  setVar(target, "--pumper-upsell-fw",       o.upsellFontStyle ? FONT_WEIGHT[o.upsellFontStyle] : undefined);
  setVar(target, "--pumper-unit-label-fs",   o.unitLabelFontSize);
  setVar(target, "--pumper-unit-label-fw",   o.unitLabelFontStyle ? FONT_WEIGHT[o.unitLabelFontStyle] : undefined);
  setVar(target, "--pumper-savings-fs",      o.savingsFontSize);

  // Layout variant — drives the data-layout attribute the CSS targets.
  if (o.layoutVariant) {
    target.setAttribute("data-pumper-layout", o.layoutVariant);
  } else {
    target.removeAttribute("data-pumper-layout");
  }
  // Grid: items-per-row CSS var (1–6, defaults to 3 if grid layout but unset).
  if (o.layoutVariant === "grid") {
    target.style.setProperty("--pumper-grid-columns", String(o.gridColumns ?? 3));
  } else {
    target.style.removeProperty("--pumper-grid-columns");
  }
}

type ShortcodeKind = "bundle" | "qb" | "mix" | "pg" | "bxgy";
type ShortcodeSpec = { kind: ShortcodeKind; selector: string; attr: string };

const SHORTCODES: ShortcodeSpec[] = [
  { kind: "bundle", selector: "[data-pumper-bundle]:not([data-pumper-rendered])",    attr: "data-pumper-bundle"    },
  { kind: "qb",     selector: "[data-pumper-qb]:not([data-pumper-rendered])",        attr: "data-pumper-qb"        },
  { kind: "mix",    selector: "[data-pumper-mix-match]:not([data-pumper-rendered])", attr: "data-pumper-mix-match" },
  { kind: "bxgy",   selector: "[data-pumper-bxgy]:not([data-pumper-rendered])",      attr: "data-pumper-bxgy"      },
  { kind: "pg",     selector: "[data-pumper-progressive]:not([data-pumper-rendered])", attr: "data-pumper-progressive" },
];

function findRenderedWidgetEl(): HTMLElement | null {
  // Pick the closest widget container to a rendered .pumper-cta button on the page.
  const cta = document.querySelector<HTMLButtonElement>("button.pumper-cta");
  if (!cta) return null;
  return cta.closest<HTMLElement>(".pumper-mount, [data-pumper-bundle], [data-pumper-qb], [data-pumper-mix-match]") ?? cta.parentElement;
}

const DEFAULT_ADDONS_ORDER = ["widget", "progressive"] as const;

function normalizeAddonsOrder(input: string[] | null | undefined): string[] {
  const valid = new Set(DEFAULT_ADDONS_ORDER);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input ?? []) {
    if (typeof item === "string" && valid.has(item as typeof DEFAULT_ADDONS_ORDER[number]) && !seen.has(item)) {
      out.push(item);
      seen.add(item);
    }
  }
  for (const item of DEFAULT_ADDONS_ORDER) {
    if (!seen.has(item)) out.push(item);
  }
  return out;
}

function renderLinkedAddons(
  parent: HTMLElement,
  cfg: WidgetConfig,
  _linkedCountdownId: string | null | undefined,
  linkedProgressiveGiftId: string | null | undefined,
  addonsOrder?: string[] | null,
): void {
  // Clear any previously inserted addon nodes so re-renders are idempotent.
  const beforeKey = "data-pumper-addons-before";
  const afterKey = "data-pumper-addons-after";
  parent.parentElement?.querySelectorAll(`[${beforeKey}], [${afterKey}]`)
    .forEach((n) => n.remove());

  // Standalone countdowns were dropped in the Pumper-parity strip-down.
  // We still accept the param for callsite compatibility (every widget
  // type passes its `linkedCountdownId` here), but never render.
  const pg = linkedProgressiveGiftId
    ? (cfg.progressiveGifts ?? []).find((p) => p.id === linkedProgressiveGiftId) ?? null
    : null;
  if (!pg) return;

  const order = normalizeAddonsOrder(addonsOrder);
  const widgetIdx = order.indexOf("widget");

  const renderInto = (slot: HTMLElement, key: "progressive") => {
    if (key === "progressive" && pg) {
      const m = document.createElement("div");
      slot.appendChild(m);
      renderProgressive(m, pg);
    }
  };

  const makeSlot = (datasetKey: string, marginProp: "marginBottom" | "marginTop") => {
    const s = document.createElement("div");
    s.setAttribute(datasetKey, "1");
    s.style.display = "flex";
    s.style.flexDirection = "column";
    s.style.gap = "10px";
    s.style[marginProp] = "12px";
    return s;
  };

  const beforeSlot = makeSlot(beforeKey, "marginBottom");
  for (let i = 0; i < widgetIdx; i++) {
    const item = order[i];
    if (item === "progressive") renderInto(beforeSlot, item);
  }
  if (beforeSlot.childElementCount > 0) {
    parent.parentElement?.insertBefore(beforeSlot, parent);
  }

  const afterSlot = makeSlot(afterKey, "marginTop");
  for (let i = widgetIdx + 1; i < order.length; i++) {
    const item = order[i];
    if (item === "progressive") renderInto(afterSlot, item);
  }
  if (afterSlot.childElementCount > 0) {
    if (parent.nextSibling) {
      parent.parentElement?.insertBefore(afterSlot, parent.nextSibling);
    } else {
      parent.parentElement?.appendChild(afterSlot);
    }
  }
}

function renderShortcode(el: HTMLElement, kind: ShortcodeKind, id: string, cfg: WidgetConfig): void {
  if (kind === "bundle") {
    const b = lookupBundle(cfg, id);
    if (!b) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, b.styleOverrides);
    renderBundle(el, b, cfg);
    renderLinkedAddons(el, cfg, b.linkedCountdownId, b.linkedProgressiveGiftId, b.addonsOrder);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "qb") {
    const q = lookupQb(cfg, id);
    if (!q) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, q.styleOverrides);
    renderQb(el, q, cfg);
    renderLinkedAddons(el, cfg, q.linkedCountdownId, q.linkedProgressiveGiftId, q.addonsOrder);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "mix") {
    const m = lookupMixMatch(cfg, id);
    if (!m) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, m.styleOverrides);
    renderMixMatch(el, m, cfg);
    renderLinkedAddons(el, cfg, m.linkedCountdownId, m.linkedProgressiveGiftId, m.addonsOrder);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "bxgy") {
    const o = lookupBxgy(cfg, id);
    if (!o) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, o.styleOverrides ?? null);
    renderBxgy(el, o, cfg);
    renderLinkedAddons(el, cfg, o.linkedCountdownId, o.linkedProgressiveGiftId, o.addonsOrder);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "pg") {
    const pg = (cfg.progressiveGifts ?? []).find((p) => p.id === id);
    if (!pg) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    renderProgressive(el, pg);
    el.dataset.pumperRendered = "1";
    return;
  }
}

function collectShortcodes(): Array<{ el: HTMLElement; kind: ShortcodeKind; id: string }> {
  const out: Array<{ el: HTMLElement; kind: ShortcodeKind; id: string }> = [];
  for (const spec of SHORTCODES) {
    document.querySelectorAll<HTMLElement>(spec.selector).forEach((el) => {
      const id = el.getAttribute(spec.attr);
      if (id) out.push({ el, kind: spec.kind, id });
    });
  }
  return out;
}

function renderMount(mount: HTMLElement, cfg: WidgetConfig): void {
  const type = mount.dataset.pumperType as WidgetType | undefined;
  const productId = toGid(mount.dataset.productId ?? "");
  if (!type || !productId) {
    mount.innerHTML = "";
    return;
  }
  if (type === "bundle") {
    const b = matchBundle(cfg, productId);
    if (!b) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, b.styleOverrides);
    renderBundle(mount, b, cfg);
    renderLinkedAddons(mount, cfg, b.linkedCountdownId, b.linkedProgressiveGiftId, b.addonsOrder);
  } else if (type === "qb") {
    const q = matchQb(cfg, productId);
    if (!q) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, q.styleOverrides);
    renderQb(mount, q, cfg);
    renderLinkedAddons(mount, cfg, q.linkedCountdownId, q.linkedProgressiveGiftId, q.addonsOrder);
  } else if (type === "mix_match") {
    const m = matchMixMatch(cfg, productId);
    if (!m) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, m.styleOverrides);
    renderMixMatch(mount, m, cfg);
    renderLinkedAddons(mount, cfg, m.linkedCountdownId, m.linkedProgressiveGiftId, m.addonsOrder);
  } else if (type === "bxgy") {
    const o = matchBxgy(cfg, productId);
    if (!o) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, o.styleOverrides ?? null);
    renderBxgy(mount, o, cfg);
    renderLinkedAddons(mount, cfg, o.linkedCountdownId, o.linkedProgressiveGiftId, o.addonsOrder);
  }
  mount.dataset.pumperRendered = "1";
}

export async function initWidget(): Promise<void> {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])"));
  const shortcodes = collectShortcodes();

  const apiBase = (window._pumperConfig?.apiBase) ?? "https://bundler.deepseatools.in/api/storefront";
  const shopFromGlobal = window._pumperConfig?.shop;
  const shopFromMount = mounts[0]?.dataset.shop;
  const shopFromPreview = window._pumperPreview ? window._pumperPreviewConfig?.shop : undefined;
  const shop = shopFromGlobal ?? shopFromMount ?? shopFromPreview ?? "";
  if (!shop) return;

  // Bail only if there's no shop context AND no work to do.
  const hasInlineWork = mounts.length > 0 || shortcodes.length > 0;
  if (!hasInlineWork && !shopFromGlobal) return;

  configureAnalytics({ apiBase, shop });

  let cfg: WidgetConfig;
  try {
    cfg = await fetchConfigOnce(shop, apiBase);
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn("[pumper] config unreachable", e);
    }
    mounts.forEach((m) => { m.innerHTML = ""; m.style.minHeight = ""; });
    shortcodes.forEach((s) => { s.el.innerHTML = ""; s.el.style.minHeight = ""; });
    return;
  }

  setLocale(cfg.settings.locale ?? "en");

  for (const m of mounts) renderMount(m, cfg);
  for (const sc of shortcodes) renderShortcode(sc.el, sc.kind, sc.id, cfg);
  const isPreview = !!window._pumperPreview;

  // If any active offer opts into hiding other apps' subscription widgets,
  // sweep them off the page once so ours is the only purchase-options UI.
  const anyHide = [
    ...cfg.bundles,
    ...cfg.quantityBreaks,
    ...(cfg.bxgyOffers ?? []),
  ].some((o) => o.subscription?.enabled && o.subscription?.hideThirdPartyWidget);
  if (anyHide) hideThirdPartySubscriptionWidgets();

  // Defensively clear any leftover removed-surface mount markers from
  // older Bundler installs still pinned to a merchant theme.
  document.querySelectorAll<HTMLElement>("[data-pumper-newsletter], [data-pumper-signup-form], [data-pumper-cart-upsell], [data-pumper-countdown]").forEach((el) => {
    el.innerHTML = "";
    el.dataset.pumperRendered = "1";
  });

  // Auto sticky-ATC (PDP only). Picks the sticky config from any active bundle
  // or QB that targets the current product and has stickyAtc.enabled. The first
  // matching widget wins; QBs take precedence over bundles when both match.
  // When a matching widget is mounted on the page, the sticky bar mirrors
  // *that* widget's CTA so qty/discount stays in sync with tier selection.
  if (!window._pumperPreview) {
    const pdpProductId = window._pumperConfig?.productId;
    if (pdpProductId) {
      const matchedQb = matchQb(cfg, pdpProductId);
      const matchedBundle = matchBundle(cfg, pdpProductId) ?? matchMixMatch(cfg, pdpProductId);
      const matchedBxgy = matchBxgy(cfg, pdpProductId);
      const stickyConfig = matchedQb?.stickyAtc?.enabled
        ? matchedQb.stickyAtc
        : matchedBundle?.stickyAtc?.enabled
          ? matchedBundle.stickyAtc
          : matchedBxgy?.stickyAtc?.enabled
            ? matchedBxgy.stickyAtc
            : null;
      if (stickyConfig) {
        const widgetEl = findRenderedWidgetEl();
        startStickyAtc(stickyConfig, widgetEl ?? undefined);
      }
    }
  }

  startObserver(cfg);

  // Expose re-render hook for preview iframe
  window._pumperRerender = () => {
    cachedConfig = null;
    document.querySelectorAll<HTMLElement>(".pumper-mount, [data-pumper-bundle], [data-pumper-qb], [data-pumper-mix-match], [data-pumper-newsletter]").forEach((m) => {
      m.removeAttribute("data-pumper-rendered");
    });
    void initWidget();
  };
}

let observerStarted = false;
function startObserver(cfg: WidgetConfig): void {
  if (observerStarted) return;
  observerStarted = true;
  const cb = () => {
    document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])").forEach((m) => {
      renderMount(m, cachedConfig ?? cfg);
    });
    for (const sc of collectShortcodes()) {
      renderShortcode(sc.el, sc.kind, sc.id, cachedConfig ?? cfg);
    }
  };
  const obs = new MutationObserver(() => {
    // Throttle via requestIdleCallback (or setTimeout fallback)
    const ric = typeof window !== "undefined"
      ? (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      : undefined;
    if (ric) ric(cb); else setTimeout(cb, 100);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void initWidget(); });
  } else {
    void initWidget();
  }
}
