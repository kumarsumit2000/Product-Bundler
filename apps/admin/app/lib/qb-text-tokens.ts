// Variables a merchant can drop into QB tier text. The widget interpolates
// these per tier (see render-qb.ts).
export const QB_TEXT_TOKENS = ["{qty}", "{DiscountPercentage}", "{DiscountAmountTotal}"] as const;

// Append a token to a text field value with exactly one separating space
// (no leading space when the field is empty).
export function insertToken(value: string, token: string): string {
  if (value.length === 0) return token;
  return value.endsWith(" ") ? value + token : value + " " + token;
}
