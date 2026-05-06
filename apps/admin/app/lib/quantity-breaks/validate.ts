import type { QbTier } from "../../../drizzle/schema";

export type QbInput = {
  name: string;
  status: string;
  productId: string;
  tiers: QbTier[];
  combinable: boolean;
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
    for (const tier of input.tiers) {
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
    }
    if (!errors.tiers && popularCount > 1) {
      errors.tiers = "Only one tier can be marked as most popular";
    }
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    errors.status = "Invalid status";
  }

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
