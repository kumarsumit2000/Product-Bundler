// Round a price (in cents) to the nearest value whose cents-part equals
// `ending` (0–99). Nearest wins; ties go to the lower candidate; never < 0.
export function roundCharmCents(priceCents: number, ending: number): number {
  const dollars = Math.floor(priceCents / 100);
  const candidates = [(dollars - 1) * 100 + ending, dollars * 100 + ending, (dollars + 1) * 100 + ending].filter((c) => c >= 0);
  let best = candidates[0]!;
  for (const c of candidates) { if (Math.abs(c - priceCents) < Math.abs(best - priceCents)) best = c; }
  return best;
}
