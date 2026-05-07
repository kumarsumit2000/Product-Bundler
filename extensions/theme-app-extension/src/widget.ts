import type { WidgetConfig, WidgetType } from "./types";
import { matchBundle, matchQb, matchMixMatch } from "./match";
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

function applyCssVars(target: HTMLElement, cfg: WidgetConfig): void {
  const s = cfg.settings;
  target.style.setProperty("--pumper-primary", s.primaryColor);
  target.style.setProperty("--pumper-text", s.textColor);
  target.style.setProperty("--pumper-bg", s.backgroundColor);
  target.style.setProperty("--pumper-radius", `${s.borderRadius}px`);
  target.style.setProperty("--pumper-font", s.fontFamily);
}

function renderMount(mount: HTMLElement, cfg: WidgetConfig): void {
  const type = mount.dataset.pumperType as WidgetType | undefined;
  const productId = toGid(mount.dataset.productId ?? "");
  if (!type || !productId) {
    mount.innerHTML = "";
    return;
  }
  applyCssVars(mount, cfg);
  if (type === "bundle") {
    const b = matchBundle(cfg, productId);
    if (!b) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderBundle(mount, b, cfg);
  } else if (type === "qb") {
    const q = matchQb(cfg, productId);
    if (!q) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderQb(mount, q, cfg);
  } else if (type === "mix_match") {
    const m = matchMixMatch(cfg, productId);
    if (!m) { mount.innerHTML = ""; mount.style.minHeight = ""; return; }
    renderMixMatch(mount, m, cfg);
  }
  mount.dataset.pumperRendered = "1";
}

export async function initWidget(): Promise<void> {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(".pumper-mount:not([data-pumper-rendered])"));
  if (mounts.length === 0) return;

  const apiBase = (window._pumperConfig?.apiBase) ?? "https://bundler.deepseatools.in/api/storefront";
  const shopFromGlobal = window._pumperConfig?.shop;
  const shopFromMount = mounts[0]!.dataset.shop;
  const shop = shopFromGlobal ?? shopFromMount ?? "";
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
    return;
  }

  setLocale(cfg.settings.locale ?? "en");

  for (const m of mounts) renderMount(m, cfg);

  startObserver(cfg);

  // Expose re-render hook for preview iframe
  window._pumperRerender = () => {
    cachedConfig = null;
    document.querySelectorAll<HTMLElement>(".pumper-mount").forEach((m) => {
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
