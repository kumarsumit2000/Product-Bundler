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
  // Page collection IDs come from the App Embed liquid, populated only on PDPs.
  const pageCollections = (typeof window !== "undefined" ? window._pumperConfig?.productCollectionIds : undefined) ?? [];
  for (const q of config.quantityBreaks) {
    if (qbVisibleOn(q, productId, pageCollections)) return q;
  }
  return null;
}

function qbVisibleOn(q: QbConfig, productId: string, pageCollectionIds: string[]): boolean {
  const visibility = q.visibility ?? "specific";
  const products = q.visibilityProductIds ?? [];
  const collections = q.visibilityCollectionIds ?? [];

  if (visibility === "all") return true;
  if (visibility === "all_except") return !products.includes(productId);
  if (visibility === "specific") {
    // Backward compat: if no explicit visibility list, fall back to legacy
    // single productId on the QB row.
    if (products.length === 0) return q.productId === productId;
    return products.includes(productId);
  }
  if (visibility === "collections") {
    return pageCollectionIds.some((cid) => collections.includes(cid));
  }
  return false;
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
