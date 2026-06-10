// Pure array operations for the QB tier list. Generic so the same helpers work
// for the admin TierFormValue and any tier-like object. No React, no I/O.
export function reorderTiers<T>(tiers: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= tiers.length || to >= tiers.length) return tiers.slice();
  const next = tiers.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
export function duplicateTier<T extends { isMostPopular: boolean }>(tiers: T[], index: number): T[] {
  if (index < 0 || index >= tiers.length) return tiers.slice();
  const clone = { ...structuredClone(tiers[index]!), isMostPopular: false };
  const next = tiers.slice();
  next.splice(index + 1, 0, clone);
  return next;
}
export function setMostPopular<T extends { isMostPopular: boolean }>(tiers: T[], index: number): T[] {
  return tiers.map((t, i) => ({ ...t, isMostPopular: i === index }));
}
export function setTierEnabled<T extends object>(tiers: T[], index: number, enabled: boolean): (T & { enabled?: boolean })[] {
  return tiers.map((t, i) => (i === index ? { ...t, enabled } : t));
}
