import type { BundleProduct } from "../../../drizzle/schema";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_BUNDLE_TEXT_KEYS = new Set(["bundle.totalLabel", "bundle.savingsBadge"]);
const ALLOWED_STYLE_KEYS = new Set(["primaryColor", "textColor", "backgroundColor", "borderRadius"]);

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
  mode: "classic" | "mix_match";
  collectionId: string | null;
  targetQty: number | null;
  styleOverrides: Record<string, unknown> | null;
  textOverrides: Record<string, string> | null;
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

  if (input.mode === "mix_match") {
    if (Array.isArray(input.products) && input.products.length > 0) {
      errors.products = "Mix & Match bundles must not have specific products";
    }
    if (!input.collectionId) {
      errors.collectionId = "Collection is required for Mix & Match";
    }
    if (!Number.isInteger(input.targetQty) || (input.targetQty as number) < 2) {
      errors.targetQty = "Target quantity must be at least 2";
    }
  } else {
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

  if (input.textOverrides !== null && input.textOverrides !== undefined) {
    if (typeof input.textOverrides !== "object" || Array.isArray(input.textOverrides)) {
      errors.textOverrides = "textOverrides must be an object";
    } else {
      for (const [k, v] of Object.entries(input.textOverrides)) {
        if (!ALLOWED_BUNDLE_TEXT_KEYS.has(k)) {
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
