import type { QbTier } from "../../../drizzle/schema";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_QB_TEXT_KEYS = new Set([
  "qb.tierLabel",
  "qb.savingsBadge",
  "qb.mostPopular",
  "qb.giftBadge",
]);
const ALLOWED_STYLE_KEYS = new Set(["primaryColor", "textColor", "backgroundColor", "borderRadius"]);

export type QbInput = {
  name: string;
  status: string;
  productId: string;
  tiers: QbTier[];
  combinable: boolean;
  headline: string | null;
  ctaLabel: string | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Record<string, string> };

export function validateQb(input: QbInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Name is required";
  } else if (input.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  if (!input.productId || !input.productId.trim()) {
    errors.productId = "Product is required";
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

  if (input.styleOverrides !== null && input.styleOverrides !== undefined) {
    if (typeof input.styleOverrides !== "object" || Array.isArray(input.styleOverrides)) {
      errors.styleOverrides = "styleOverrides must be an object";
    } else {
      for (const [k, v] of Object.entries(input.styleOverrides)) {
        if (!ALLOWED_STYLE_KEYS.has(k)) {
          errors.styleOverrides = `Unknown style key: ${k}`;
          break;
        }
        if (k === "borderRadius") {
          if (typeof v !== "number" || v < 0 || v > 24) {
            errors.styleOverrides = "borderRadius must be a number between 0 and 24";
            break;
          }
        } else {
          if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
            errors.styleOverrides = `${k} must be a hex color like #RRGGBB`;
            break;
          }
        }
      }
    }
  }

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
