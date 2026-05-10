import type { BundleConfig, BxgyOfferConfig, QbConfig, WidgetConfig } from "./types";

export function lookupBundle(
  cfg: WidgetConfig,
  id: string
): BundleConfig | null {
  return cfg.bundles.find((b) => b.id === id && b.mode === "classic") ?? null;
}

export function lookupQb(cfg: WidgetConfig, id: string): QbConfig | null {
  return cfg.quantityBreaks.find((q) => q.id === id) ?? null;
}

export function lookupMixMatch(
  cfg: WidgetConfig,
  id: string
): BundleConfig | null {
  return cfg.bundles.find((b) => b.id === id && b.mode === "mix_match") ?? null;
}

export function lookupBxgy(cfg: WidgetConfig, id: string): BxgyOfferConfig | null {
  return (cfg.bxgyOffers ?? []).find((o) => o.id === id) ?? null;
}
