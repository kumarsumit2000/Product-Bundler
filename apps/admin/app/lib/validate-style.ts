// Shared validation for the styleOverrides JSON column. Used by both the
// bundles and quantity-breaks validators so the allowlist + bounds stay in
// one place. Returns an error message string if the input is bad, or null
// if it's acceptable.

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const COLOR_KEYS = new Set([
  "primaryColor", "textColor", "backgroundColor",
  "cardsBg", "selectedBg", "borderColor", "blockTitleColor",
  "titleColor", "subtitleColor", "priceColor", "fullPriceColor",
  "labelBg", "labelText",
  "badgeBg", "badgeText",
  "freeGiftBg", "freeGiftText", "freeGiftSelectedBg", "freeGiftSelectedText",
  "upsellBg", "upsellText", "upsellSelectedBg", "upsellSelectedText",
]);

// Numeric fields. Each entry is [min, max] inclusive.
const NUMBER_KEYS: Record<string, [number, number]> = {
  borderRadius: [0, 48],
  spacing: [0, 64],
  gridColumns: [1, 6],
  blockTitleFontSize: [10, 48],
  titleFontSize: [10, 48],
  subtitleFontSize: [10, 48],
  labelFontSize: [10, 48],
  freeGiftFontSize: [10, 48],
  upsellFontSize: [10, 48],
  unitLabelFontSize: [10, 48],
};

const FONT_STYLES = new Set(["regular", "medium", "semibold", "bold"]);
const LAYOUT_VARIANTS = new Set(["list", "grid"]);

const FONT_STYLE_KEYS = new Set([
  "blockTitleFontStyle",
  "titleFontStyle",
  "subtitleFontStyle",
  "labelFontStyle",
  "freeGiftFontStyle",
  "upsellFontStyle",
  "unitLabelFontStyle",
]);

export function validateStyleOverrides(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    return "styleOverrides must be an object";
  }

  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === "layoutVariant") {
      if (typeof v !== "string" || !LAYOUT_VARIANTS.has(v)) {
        return "layoutVariant must be one of: list, grid";
      }
      continue;
    }

    if (FONT_STYLE_KEYS.has(k)) {
      if (typeof v !== "string" || !FONT_STYLES.has(v)) {
        return `${k} must be one of: regular, medium, semibold, bold`;
      }
      continue;
    }

    if (k in NUMBER_KEYS) {
      const [min, max] = NUMBER_KEYS[k]!;
      if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
        return `${k} must be an integer between ${min} and ${max}`;
      }
      continue;
    }

    if (COLOR_KEYS.has(k)) {
      if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
        return `${k} must be a hex color like #RRGGBB`;
      }
      continue;
    }

    return `Unknown style key: ${k}`;
  }

  return null;
}
