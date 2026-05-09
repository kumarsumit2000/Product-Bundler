import type { WidgetConfig, WidgetType, StyleOverrides } from "./types";
import { matchBundle, matchQb, matchMixMatch } from "./match";
import { lookupBundle, lookupQb, lookupMixMatch } from "./lookup";
import { renderBundle } from "./render-bundle";
import { renderQb } from "./render-qb";
import { renderMixMatch } from "./render-mix-match";
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

export function applyCssVars(
  target: HTMLElement,
  cfg: WidgetConfig,
  override: StyleOverrides | null,
): void {
  const s = cfg.settings;
  target.style.setProperty("--pumper-primary",  override?.primaryColor    ?? s.primaryColor);
  target.style.setProperty("--pumper-text",     override?.textColor       ?? s.textColor);
  target.style.setProperty("--pumper-bg",       override?.backgroundColor ?? s.backgroundColor);
  target.style.setProperty("--pumper-radius",   `${override?.borderRadius ?? s.borderRadius}px`);
  target.style.setProperty("--pumper-font",     s.fontFamily);
}

type ShortcodeKind = "bundle" | "qb" | "mix";
type ShortcodeSpec = { kind: ShortcodeKind; selector: string; attr: string };

const SHORTCODES: ShortcodeSpec[] = [
  { kind: "bundle", selector: "[data-pumper-bundle]:not([data-pumper-rendered])",    attr: "data-pumper-bundle"    },
  { kind: "qb",     selector: "[data-pumper-qb]:not([data-pumper-rendered])",        attr: "data-pumper-qb"        },
  { kind: "mix",    selector: "[data-pumper-mix-match]:not([data-pumper-rendered])", attr: "data-pumper-mix-match" },
];

function renderShortcode(el: HTMLElement, kind: ShortcodeKind, id: string, cfg: WidgetConfig): void {
  if (kind === "bundle") {
    const b = lookupBundle(cfg, id);
    if (!b) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, b.styleOverrides);
    renderBundle(el, b, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  if (kind === "qb") {
    const q = lookupQb(cfg, id);
    if (!q) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
    applyCssVars(el, cfg, q.styleOverrides);
    renderQb(el, q, cfg);
    el.dataset.pumperRendered = "1";
    return;
  }
  // kind === "mix"
  const m = lookupMixMatch(cfg, id);
  if (!m) { el.innerHTML = ""; el.style.minHeight = ""; el.dataset.pumperRendered = "1"; return; }
  applyCssVars(el, cfg, m.styleOverrides);
  renderMixMatch(el, m, cfg);
  el.dataset.pumperRendered = "1";
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
  } else if (type === "qb") {
    const q = matchQb(cfg, productId);
    if (!q) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, q.styleOverrides);
    renderQb(mount, q, cfg);
  } else if (type === "mix_match") {
    const m = matchMixMatch(cfg, productId);
    if (!m) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    applyCssVars(mount, cfg, m.styleOverrides);
    renderMixMatch(mount, m, cfg);
  }
  mount.dataset.pumperRendered = "1";
}

export async function initWidget(): Promise<void> {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])"));
  const shortcodes = collectShortcodes();
  if (mounts.length === 0 && shortcodes.length === 0) return;

  const apiBase = (window._pumperConfig?.apiBase) ?? "https://bundler.deepseatools.in/api/storefront";
  const shopFromGlobal = window._pumperConfig?.shop;
  const shopFromMount = mounts[0]?.dataset.shop;
  const shopFromPreview = window._pumperPreview ? window._pumperPreviewConfig?.shop : undefined;
  const shop = shopFromGlobal ?? shopFromMount ?? shopFromPreview ?? "";
  if (!shop) return;

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

  startObserver(cfg);

  // Expose re-render hook for preview iframe
  window._pumperRerender = () => {
    cachedConfig = null;
    document.querySelectorAll<HTMLElement>(".pumper-mount, [data-pumper-bundle], [data-pumper-qb], [data-pumper-mix-match]").forEach((m) => {
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
