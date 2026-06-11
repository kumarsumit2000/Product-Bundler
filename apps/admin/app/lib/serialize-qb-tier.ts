import type { QbTier } from "../../drizzle/schema";
import type { TierFormValue } from "../components/QbTierBuilder";

// Converts a TierFormValue (flat form shape) into the persisted QbTier record.
// Reused by both QB route actions so BOGO + per-tier free gift serialize from
// the form's actual fields rather than the non-existent t.bogo/t.freeGiftVariantId.
export function serializeTierForm(t: TierFormValue): QbTier {
  const hasBogo = !!t.bogoMode;
  return {
    qty: t.qty,
    discountType: t.discountType,
    discountValue: t.discountValue,
    label: t.label,
    isMostPopular: t.isMostPopular,
    enabled: t.enabled,
    image: t.image || undefined,
    freeShipping: t.freeShipping || undefined,
    soldOut: t.soldOut || undefined,
    priceRounding: t.priceRounding ?? undefined,
    freeGiftVariantId: t.freeGiftVariant?.variantId ?? undefined,
    bogo: hasBogo
      ? { mode: t.bogoMode as "add_same" | "add_different" | "nth_free", targetVariantId: t.bogoTargetVariant?.variantId ?? undefined, bonusQty: t.bogoBonusQty ?? 1 }
      : undefined,
    extraProducts: (t.extraProducts ?? []).map((p) => ({ productId: p.productId, variantId: p.variantId, qty: p.qty, title: p.title, image: p.image })),
  };
}
