import type { BundleConfig, QbConfig, WidgetConfig } from "./types";

export function matchBundle(config: WidgetConfig, productId: string): BundleConfig | null {
  for (const b of config.bundles) {
    if (b.mode !== "classic") continue;
    if (b.triggerProductIds.length > 0) {
      if (b.triggerProductIds.includes(productId)) return b;
    } else {
      if (b.products.some((p) => p.productId === productId)) return b;
    }
  }
  return null;
}

export function matchQb(config: WidgetConfig, productId: string): QbConfig | null {
  for (const q of config.quantityBreaks) {
    if (q.productId === productId) return q;
  }
  return null;
}

export function matchMixMatch(config: WidgetConfig, productId: string): BundleConfig | null {
  for (const b of config.bundles) {
    if (b.mode !== "mix_match") continue;
    if (b.triggerProductIds.length > 0) {
      if (b.triggerProductIds.includes(productId)) return b;
    } else {
      const inCollection = (b.collectionProducts ?? []).some((p) => p.productId === productId);
      if (inCollection) return b;
    }
  }
  return null;
}
