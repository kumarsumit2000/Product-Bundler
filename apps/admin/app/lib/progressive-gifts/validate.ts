import type { ProgressiveThreshold } from "../../../drizzle/schema";

export type ProgressiveGiftInput = {
  name: string;
  status: string;
  thresholds: ProgressiveThreshold[];
  headline: string | null;
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: Record<string, string> };

export function validateProgressiveGift(input: ProgressiveGiftInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || input.name.trim().length === 0) errors.name = "Name is required";
  if (input.name && input.name.length > 100) errors.name = "Name must be 100 characters or fewer";

  if (!["draft", "active", "paused"].includes(input.status)) errors.status = "Invalid status";

  if (!Array.isArray(input.thresholds) || input.thresholds.length === 0) {
    errors.thresholds = "Add at least one gift threshold";
  } else {
    for (const t of input.thresholds) {
      const isShipping = t.kind === "free_shipping";
      if (!isShipping && !t.giftVariantId && !t.giftProductId) {
        errors.thresholds = "Each free-gift threshold needs a product or variant";
        break;
      }
      if (typeof t.minSpendCents !== "number" || t.minSpendCents < 0) {
        errors.thresholds = "Minimum spend must be 0 or greater";
        break;
      }
      if (!t.label || t.label.trim().length === 0) {
        errors.thresholds = "Each threshold needs a label";
        break;
      }
    }
  }

  if (input.headline && input.headline.length > 100) errors.headline = "Headline must be 100 characters or fewer";

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
