type StringTable = Record<string, string>;

const EN: StringTable = {
  "bundle.heading": "Frequently bought together",
  "bundle.totalLabel": "Total",
  "bundle.cta": "Add bundle to cart",
  "bundle.ctaSavings": "Add bundle to cart — Save {savings}",
  "bundle.unavailable": "1 item out of stock — bundle unavailable",
  "qb.heading": "Choose your savings",
  "qb.tierLabel": "Buy {qty}",
  "qb.savingsBadge": "−{savings}",
  "qb.cta": "Add {qty} to cart",
  "qb.ctaSavings": "Add {qty} to cart — Save {savings}",
  "qb.mostPopular": "MOST POPULAR",
  "qb.tierUnavailable": "Only {available} left",
  "mm.heading": "Pick any {target} — Save {discount}",
  "mm.picked": "{count} of {target} picked",
  "mm.pickMore": "Pick {n} more",
  "mm.cta": "Add bundle to cart",
  "mm.ctaPickMore": "Pick {n} more to unlock {discount}",
  "mm.notEnoughStock": "Not enough items in stock",
  "mm.viewAll": "View all ({n})",
  "addToCart.error": "Couldn't add to cart — please try again.",
  "addToCart.unavailable": "Sorry, that item is no longer available.",
  "qb.giftBadge": "🎁 + Free {variantTitle}",
  "qb.giftBadgeUnavailable": "🎁 Free gift unavailable — out of stock",
  "qb.bogoSameOne": "🎁 + 1 free",
  "qb.bogoSameMany": "🎁 + {n} free",
  "qb.bogoDifferent": "🎁 + Free {variantTitle}",
  "qb.bogoNthFree": "🎁 Buy {qty}, pay for {paidQty}",
};

const TABLES: Record<string, StringTable> = { en: EN };

let active: StringTable = TABLES.en!;

export function setLocale(loc: string): void {
  active = TABLES[loc.split("-")[0]!] ?? TABLES.en!;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const tmpl = active[key] ?? key;
  if (!vars) return tmpl;
  return tmpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
