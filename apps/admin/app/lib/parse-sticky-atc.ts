import type { StickyAtcConfig } from "../../drizzle/schema";

const DEFAULTS: StickyAtcConfig = {
  enabled: false,
  showImage: true,
  showQty: true,
  showPrice: true,
  ctaLabel: "Add to cart",
  backgroundColor: "#FFFFFF",
  textColor: "#1A1A1A",
  buttonBg: "#1A1A1A",
  buttonText: "#FFFFFF",
};

const COLOR_MAX = 16;
const LABEL_MAX = 30;

function clipColor(s: unknown, fallback: string): string {
  return typeof s === "string" && s.length > 0 ? s.slice(0, COLOR_MAX) : fallback;
}

export function parseStickyAtc(raw: string | null): StickyAtcConfig | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<StickyAtcConfig>;
  if (!p.enabled) return null;
  return {
    enabled: true,
    showImage: p.showImage !== false,
    showQty: p.showQty !== false,
    showPrice: p.showPrice !== false,
    ctaLabel: typeof p.ctaLabel === "string" && p.ctaLabel.length > 0
      ? p.ctaLabel.slice(0, LABEL_MAX)
      : DEFAULTS.ctaLabel,
    backgroundColor: clipColor(p.backgroundColor, DEFAULTS.backgroundColor),
    textColor: clipColor(p.textColor, DEFAULTS.textColor),
    buttonBg: clipColor(p.buttonBg, DEFAULTS.buttonBg),
    buttonText: clipColor(p.buttonText, DEFAULTS.buttonText),
  };
}
