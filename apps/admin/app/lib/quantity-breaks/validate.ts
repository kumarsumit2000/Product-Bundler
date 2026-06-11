import type { QbTier } from "../../../drizzle/schema";
import { validateStyleOverrides } from "../validate-style";

const ALLOWED_QB_TEXT_KEYS = new Set([
  "qb.tierLabel",
  "qb.savingsBadge",
  "qb.mostPopular",
  "qb.giftBadge",
  "qb.freeGiftCallout",
  "qb.freeGiftCallout.hidden",
]);

export type QbInput = {
  name: string;
  status: string;
  productId: string;
  tiers: QbTier[];
  combinable: boolean;
  afterAddToCart: string;
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, unknown> | null;
  visibility?: "all" | "all_except" | "specific" | "collections";
  visibilityProductIds?: string[];
  visibilityCollectionIds?: string[];
  bindToCurrentProduct?: boolean;
};

export type ValidationResult =
  | { valid: true; afterAddToCart: string }
  | { valid: false; errors: Record<string, string> };

export function validateQb(input: QbInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Name is required";
  } else if (input.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  // The QB needs a product to read variants/prices from on the storefront,
  // UNLESS it's set to follow the current PDP product (universal template).
  // Visibility settings independently control which PDPs the widget appears on.
  if (!input.productId && !input.bindToCurrentProduct) {
    errors.productId = "Pick the product whose variants the QB applies to";
  }

  const visibility = input.visibility ?? "specific";
  const vProducts = input.visibilityProductIds ?? [];
  const vCollections = input.visibilityCollectionIds ?? [];
  if (visibility === "specific" && vProducts.length === 0) {
    errors.visibility = "Pick at least one product to show this widget on";
  } else if (visibility === "all_except" && vProducts.length === 0) {
    errors.visibility = "Pick at least one product to exclude — or change to All products";
  } else if (visibility === "collections" && vCollections.length === 0) {
    errors.visibility = "Pick at least one collection to show this widget on";
  }

  if (!Array.isArray(input.tiers) || input.tiers.length === 0) {
    errors.tiers = "At least one tier is required";
  } else if (input.tiers.length > 10) {
    errors.tiers = "Maximum 10 tiers";
  } else {
    let popularCount = 0;
    let lastQty = 0;
    for (const [i, tier] of input.tiers.entries()) {
      if (typeof tier.qty !== "number" || tier.qty < 1) {
        errors.tiers = "Tier qty must be at least 1";
        break;
      }
      if (tier.qty <= lastQty) {
        errors.tiers = "Tiers must be in ascending qty order";
        break;
      }
      lastQty = tier.qty;

      if (!["percentage", "flat", "fixed_per_unit"].includes(tier.discountType)) {
        errors.tiers = "Invalid tier discount type";
        break;
      }
      if (typeof tier.discountValue !== "number" || tier.discountValue < 0) {
        errors.tiers = "Tier discount value must be non-negative";
        break;
      }
      if (tier.discountType === "percentage" && tier.discountValue > 100) {
        errors.tiers = "Tier percentage cannot exceed 100";
        break;
      }
      if (tier.isMostPopular) popularCount++;

      if (tier.freeGiftVariantId !== undefined && tier.freeGiftVariantId !== null) {
        if (
          typeof tier.freeGiftVariantId !== "string" ||
          !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(tier.freeGiftVariantId)
        ) {
          errors.tiers = `Tier ${i + 1}: free gift variant id must be a valid Shopify variant GID`;
          break;
        }
      }

      if (tier.bogo !== undefined && tier.bogo !== null) {
        const b = tier.bogo;
        if (!["add_same", "add_different", "nth_free"].includes(b.mode)) {
          errors.tiers = `Tier ${i + 1}: invalid BOGO mode`;
          break;
        }
        if (typeof b.bonusQty !== "number" || !Number.isInteger(b.bonusQty) || b.bonusQty < 1) {
          errors.tiers = `Tier ${i + 1}: BOGO bonus quantity must be an integer >= 1`;
          break;
        }
        if (b.mode === "add_same" || b.mode === "add_different") {
          if (
            !b.targetVariantId ||
            !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(b.targetVariantId)
          ) {
            errors.tiers = `Tier ${i + 1}: BOGO target variant id is required for ${b.mode}`;
            break;
          }
        }
        if (b.mode === "nth_free" && b.bonusQty >= tier.qty) {
          errors.tiers = `Tier ${i + 1}: BOGO bonus quantity must be less than tier qty for nth_free`;
          break;
        }
      }
    }
    if (!errors.tiers && popularCount > 1) {
      errors.tiers = "Only one tier can be marked as most popular";
    }
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    errors.status = "Invalid status";
  }

  if (input.headline && input.headline.length > 100) {
    errors.headline = "Headline must be 100 characters or less";
  }

  if (input.ctaLabel && input.ctaLabel.length > 50) {
    errors.ctaLabel = "CTA label must be 50 characters or less";
  }

  if (input.textOverrides !== null && input.textOverrides !== undefined) {
    if (typeof input.textOverrides !== "object" || Array.isArray(input.textOverrides)) {
      errors.textOverrides = "textOverrides must be an object";
    } else {
      for (const [k, v] of Object.entries(input.textOverrides)) {
        if (!ALLOWED_QB_TEXT_KEYS.has(k)) {
          errors.textOverrides = `Unknown text override key: ${k}`;
          break;
        }
        if (typeof v !== "string") {
          errors.textOverrides = `Text override for ${k} must be a string`;
          break;
        }
        if (v.length > 120) {
          errors.textOverrides = `Text override for ${k} must be 120 characters or less`;
          break;
        }
      }
    }
  }

  const styleErr = validateStyleOverrides(input.styleOverrides);
  if (styleErr) errors.styleOverrides = styleErr;

  const afterAddToCart = ["drawer", "cart", "checkout"].includes(input.afterAddToCart)
    ? input.afterAddToCart
    : "drawer";

  return Object.keys(errors).length === 0
    ? { valid: true, afterAddToCart }
    : { valid: false, errors };
}
