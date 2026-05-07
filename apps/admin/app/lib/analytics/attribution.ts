import { and, eq, inArray } from "drizzle-orm";
import { schema } from "~/db.server";

export type ParsedAttribution = {
  bundleId: string;
  widgetType: "bundle" | "qb" | "mix_match";
  revenueCents: number;
  units: number;
};

type ShopifyLineItem = {
  price_set: { shop_money: { amount: string } };
  quantity: number;
  properties: Array<{ name: string; value: string }>;
};

type ShopifyOrderPayload = { line_items: ShopifyLineItem[] };

function dollarsStrToCents(s: string): number {
  const parsed = parseFloat(s);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function getBundleIdFromLine(line: ShopifyLineItem): string | null {
  const prop = (line.properties ?? []).find((p) => p.name === "_pumper_bundle_id");
  return prop?.value ?? null;
}

export async function parseOrderAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  shopId: string,
  order: ShopifyOrderPayload,
): Promise<{ totalCents: number; perBundle: ParsedAttribution[] }> {
  const grouped = new Map<string, { revenueCents: number; units: number }>();

  for (const line of order.line_items ?? []) {
    const bundleId = getBundleIdFromLine(line);
    if (!bundleId) continue;
    const linePriceCents = dollarsStrToCents(line.price_set.shop_money.amount) * line.quantity;
    const existing = grouped.get(bundleId);
    if (existing) {
      existing.revenueCents += linePriceCents;
      existing.units += line.quantity;
    } else {
      grouped.set(bundleId, { revenueCents: linePriceCents, units: line.quantity });
    }
  }

  if (grouped.size === 0) {
    return { totalCents: 0, perBundle: [] };
  }

  const ids = [...grouped.keys()];

  const bundleRows = await db
    .select({ id: schema.bundles.id, mode: schema.bundles.mode })
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), inArray(schema.bundles.id, ids)));
  const qbRows = await db
    .select({ id: schema.quantityBreaks.id })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));

  const widgetTypeMap = new Map<string, "bundle" | "qb" | "mix_match">();
  for (const b of bundleRows) {
    widgetTypeMap.set(b.id, b.mode === "mix_match" ? "mix_match" : "bundle");
  }
  for (const q of qbRows) {
    widgetTypeMap.set(q.id, "qb");
  }

  const perBundle: ParsedAttribution[] = [];
  let totalCents = 0;
  for (const [bundleId, agg] of grouped.entries()) {
    const widgetType = widgetTypeMap.get(bundleId);
    if (!widgetType) continue; // orphan — skip
    perBundle.push({ bundleId, widgetType, revenueCents: agg.revenueCents, units: agg.units });
    totalCents += agg.revenueCents;
  }

  return { totalCents, perBundle };
}
