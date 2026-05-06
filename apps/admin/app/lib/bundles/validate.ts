import type { BundleProduct } from "../../../drizzle/schema";

export type BundleInput = {
  name: string;
  status: string;
  products: BundleProduct[];
  discountType: string;
  discountValue: number;
  combinable: boolean;
  triggerProductIds: string[];
  headline: string | null;
  ctaLabel: string | null;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Record<string, string> };

export function validateBundle(input: BundleInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Name is required";
  } else if (input.name.length > 100) {
    errors.name = "Name must be 100 characters or less";
  }

  if (!Array.isArray(input.products) || input.products.length < 2) {
    errors.products = "Bundle must have at least 2 products";
  } else {
    for (const p of input.products) {
      if (!p.productId) {
        errors.products = "Each product must have a product ID";
        break;
      }
      if (typeof p.qty !== "number" || p.qty < 1 || p.qty > 100) {
        errors.products = "Quantity must be between 1 and 100";
        break;
      }
    }
  }

  if (!["percentage", "flat", "fixed_total"].includes(input.discountType)) {
    errors.discountType = "Invalid discount type";
  }

  if (typeof input.discountValue !== "number" || input.discountValue <= 0) {
    errors.discountValue = "Discount value must be positive";
  } else if (input.discountType === "percentage" && input.discountValue > 100) {
    errors.discountValue = "Percentage cannot exceed 100";
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

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
