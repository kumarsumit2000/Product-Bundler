export function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type LineLite = { priceCents: number; qty: number };

export function computeBundleTotals(
  bundle: { products: LineLite[] },
  discountType: string,
  discountValue: number,
): { subtotalCents: number; discountedCents: number; savingsCents: number } {
  const subtotalCents = bundle.products.reduce((s, p) => s + p.priceCents * p.qty, 0);

  let discountedCents = subtotalCents;
  if (discountType === "percentage") {
    discountedCents = Math.round(subtotalCents * (1 - discountValue / 100));
  } else if (discountType === "flat") {
    // discountValue is in dollars (merchant types e.g. 15 = $15 off); convert to cents
    discountedCents = Math.max(0, subtotalCents - Math.round(discountValue * 100));
  } else if (discountType === "fixed_total") {
    // discountValue is in dollars (e.g. 50 = $50 total); convert to cents
    discountedCents = Math.max(0, Math.round(discountValue * 100));
  }

  return {
    subtotalCents,
    discountedCents,
    savingsCents: Math.max(0, subtotalCents - discountedCents),
  };
}
