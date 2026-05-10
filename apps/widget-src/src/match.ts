import type { BundleConfig, QbConfig, WidgetConfig } from "./types";

function bundleVisibleOn(b: BundleConfig, productId: string, pageCollectionIds: string[]): boolean {
  const visibility = b.visibility ?? (b.triggerProductIds.length > 0 ? "specific" : "same_as_members");
  if (visibility === "all") return true;
  if (visibility === "all_except") return !b.triggerProductIds.includes(productId);
  if (visibility === "specific") return b.triggerProductIds.includes(productId);
  if (visibility === "collections") {
    const list = b.visibilityCollectionIds ?? [];
    return pageCollectionIds.some((cid) => list.includes(cid));
  }
  // same_as_members
  if (b.mode === "classic") {
    return b.products.some((p) => p.productId === productId);
  }
  // mix_match: any product in the linked collection
  return (b.collectionProducts ?? []).some((p) => p.productId === productId);
}

export function matchBundle(config: WidgetConfig, productId: string): BundleConfig | null {
  const pageCollections = (typeof window !== "undefined" ? window._pumperConfig?.productCollectionIds : undefined) ?? [];
  for (const b of config.bundles) {
    if (b.mode !== "classic") continue;
    if (bundleVisibleOn(b, productId, pageCollections)) return b;
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
  const pageCollections = (typeof window !== "undefined" ? window._pumperConfig?.productCollectionIds : undefined) ?? [];
  for (const b of config.bundles) {
    if (b.mode !== "mix_match") continue;
    if (bundleVisibleOn(b, productId, pageCollections)) return b;
  }
  return null;
}
