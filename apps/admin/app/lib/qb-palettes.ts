import type { StylePanelValues } from "../components/StylePanel";

// Mix a #rrggbb (or #rgb) color toward white by `pct` (0–100). Returns #rrggbb.
// On malformed input, returns the input unchanged (never throws).
export function mixHex(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

export type QbPalette = { id: string; name: string; accent: string };

export const QB_PALETTES: QbPalette[] = [
  { id: "noir", name: "Noir", accent: "#1a1a1a" },
  { id: "forest", name: "Forest", accent: "#2f7d4f" },
  { id: "teal", name: "Teal", accent: "#0d9488" },
  { id: "navy", name: "Navy", accent: "#1e3a8a" },
  { id: "blue", name: "Blue", accent: "#2563eb" },
  { id: "periwinkle", name: "Periwinkle", accent: "#6366f1" },
  { id: "purple", name: "Purple", accent: "#7c3aed" },
  { id: "magenta", name: "Magenta", accent: "#be185d" },
  { id: "crimson", name: "Crimson", accent: "#b91c1c" },
  { id: "orange", name: "Orange", accent: "#ea580c" },
  { id: "cocoa", name: "Cocoa", accent: "#7c4a2d" },
  { id: "sand", name: "Sand", accent: "#b08968" },
];

// Coordinated color scheme derived from one accent. Only color fields — leaves
// layout / radius / spacing / font fields untouched.
export function applyPalette(accent: string): Partial<StylePanelValues> {
  return {
    primaryColor: accent,
    cardsBg: "#ffffff",
    selectedBg: "#ffffff",
    tierBg: mixHex(accent, 90),
    borderColor: mixHex(accent, 70),
    blockTitleColor: "#1a1a1a",
    titleColor: "#1a1a1a",
    priceColor: "#1a1a1a",
    subtitleColor: "#6b7280",
    labelBg: mixHex(accent, 82),
    labelText: accent,
    badgeBg: mixHex(accent, 82),
    badgeText: accent,
  };
}
