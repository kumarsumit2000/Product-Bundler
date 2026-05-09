// Helpers that pull live form-state values into the shape the preview iframe
// + the storefront-config payload expect. Form holds colors as strings
// ("" = inherit) and font sizes as strings; preview/persisted shape uses
// numbers and only includes keys that are actually set.

import type { FontStyle, LayoutVariant } from "../../drizzle/schema";

type StyleFormFields = {
  // Layout
  layoutVariant: LayoutVariant | "";
  gridColumns: string;
  borderRadius: string;
  spacing: string;

  // Legacy color shorthand (kept for backward compat)
  primaryColor: string;
  textColor: string;
  backgroundColor: string;

  // General
  cardsBg: string;
  tierBg: string;
  selectedBg: string;
  borderColor: string;
  blockTitleColor: string;

  // Bar texts
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  fullPriceColor: string;

  // Label
  labelBg: string;
  labelText: string;

  // Badge
  badgeBg: string;
  badgeText: string;

  // Free gift
  freeGiftBg: string;
  freeGiftText: string;
  freeGiftSelectedBg: string;
  freeGiftSelectedText: string;

  // Upsell
  upsellBg: string;
  upsellText: string;
  upsellSelectedBg: string;
  upsellSelectedText: string;

  // Typography
  blockTitleFontSize: string;
  blockTitleFontStyle: FontStyle | "";
  titleFontSize: string;
  titleFontStyle: FontStyle | "";
  subtitleFontSize: string;
  subtitleFontStyle: FontStyle | "";
  labelFontSize: string;
  labelFontStyle: FontStyle | "";
  freeGiftFontSize: string;
  freeGiftFontStyle: FontStyle | "";
  upsellFontSize: string;
  upsellFontStyle: FontStyle | "";
  unitLabelFontSize: string;
  unitLabelFontStyle: FontStyle | "";
};

const COLOR_KEYS: Array<keyof StyleFormFields> = [
  "primaryColor",
  "textColor",
  "backgroundColor",
  "cardsBg",
  "tierBg",
  "selectedBg",
  "borderColor",
  "blockTitleColor",
  "titleColor",
  "subtitleColor",
  "priceColor",
  "fullPriceColor",
  "labelBg",
  "labelText",
  "badgeBg",
  "badgeText",
  "freeGiftBg",
  "freeGiftText",
  "freeGiftSelectedBg",
  "freeGiftSelectedText",
  "upsellBg",
  "upsellText",
  "upsellSelectedBg",
  "upsellSelectedText",
];

const NUMBER_KEYS: Array<keyof StyleFormFields> = [
  "borderRadius",
  "spacing",
  "gridColumns",
  "blockTitleFontSize",
  "titleFontSize",
  "subtitleFontSize",
  "labelFontSize",
  "freeGiftFontSize",
  "upsellFontSize",
  "unitLabelFontSize",
];

const ENUM_KEYS: Array<keyof StyleFormFields> = [
  "layoutVariant",
  "blockTitleFontStyle",
  "titleFontStyle",
  "subtitleFontStyle",
  "labelFontStyle",
  "freeGiftFontStyle",
  "upsellFontStyle",
  "unitLabelFontStyle",
];

export function buildStyleOverrides(values: Partial<StyleFormFields>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  for (const k of COLOR_KEYS) {
    const v = values[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  for (const k of NUMBER_KEYS) {
    const v = values[k];
    if (typeof v === "string" && v.length > 0) {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  for (const k of ENUM_KEYS) {
    const v = values[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }

  return Object.keys(out).length > 0 ? out : null;
}

export function buildTextOverrides(
  raw: Record<string, string> | undefined,
): Record<string, string> | null {
  if (!raw) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Default form-shape so callers can spread {...EMPTY_STYLE_FORM, ...overrides}
// without having to enumerate ~36 fields each time.
export const EMPTY_STYLE_FORM: StyleFormFields = {
  layoutVariant: "",
  gridColumns: "",
  borderRadius: "",
  spacing: "",
  primaryColor: "",
  textColor: "",
  backgroundColor: "",
  cardsBg: "",
  tierBg: "",
  selectedBg: "",
  borderColor: "",
  blockTitleColor: "",
  titleColor: "",
  subtitleColor: "",
  priceColor: "",
  fullPriceColor: "",
  labelBg: "",
  labelText: "",
  badgeBg: "",
  badgeText: "",
  freeGiftBg: "",
  freeGiftText: "",
  freeGiftSelectedBg: "",
  freeGiftSelectedText: "",
  upsellBg: "",
  upsellText: "",
  upsellSelectedBg: "",
  upsellSelectedText: "",
  blockTitleFontSize: "",
  blockTitleFontStyle: "",
  titleFontSize: "",
  titleFontStyle: "",
  subtitleFontSize: "",
  subtitleFontStyle: "",
  labelFontSize: "",
  labelFontStyle: "",
  freeGiftFontSize: "",
  freeGiftFontStyle: "",
  upsellFontSize: "",
  upsellFontStyle: "",
  unitLabelFontSize: "",
  unitLabelFontStyle: "",
};

// Inverse of buildStyleOverrides — take a saved JSON object and produce the
// flat string-everywhere shape the form holds in state. Unknown keys are
// dropped silently so old data with obsolete fields doesn't break hydration.
export function styleOverridesToFormFields(
  overrides: Record<string, unknown> | null | undefined,
): StyleFormFields {
  const out: StyleFormFields = { ...EMPTY_STYLE_FORM };
  if (!overrides || typeof overrides !== "object") return out;

  for (const [k, v] of Object.entries(overrides)) {
    if (!(k in out)) continue;
    if (typeof v === "number") {
      (out as Record<string, string>)[k] = String(v);
    } else if (typeof v === "string") {
      (out as Record<string, string>)[k] = v;
    }
  }
  return out;
}

export type { StyleFormFields };
