// Helpers that pull live form-state values into the shape the preview iframe
// expects. The form holds colors as strings ("" = inherit) and a flat
// textOverrides record with empty strings for unset entries; the preview
// payload wants compact objects (or null) so the widget treats unset values
// as "fall back to shop default" the same way the real config endpoint does.

type StyleFormFields = {
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: string;
};

export function buildStyleOverrides(values: StyleFormFields): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (values.primaryColor) out.primaryColor = values.primaryColor;
  if (values.textColor) out.textColor = values.textColor;
  if (values.backgroundColor) out.backgroundColor = values.backgroundColor;
  if (values.borderRadius) {
    const n = parseInt(values.borderRadius, 10);
    if (Number.isFinite(n)) out.borderRadius = n;
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
