const VALID = new Set(["countdown", "widget", "progressive"]);

export function parseAddonsOrder(raw: string | null): string[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item === "string" && VALID.has(item) && !seen.has(item)) {
      out.push(item);
      seen.add(item);
    }
  }
  if (out.length !== 3) return null;
  return out;
}
