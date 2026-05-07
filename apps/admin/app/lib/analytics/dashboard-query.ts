import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema } from "~/db.server";

export type DateRange = { startDate: string; endDate: string };

// 1. KPIs — totals + sparkline series from revenue_daily
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getKpis(db: any, shopId: string, range: DateRange) {
  const rows: Array<{
    date: string;
    totalRevenueCents: number;
    totalOrders: number;
    bundleOrders: number;
  }> = await db
    .select({
      date: schema.revenueDaily.date,
      totalRevenueCents: schema.revenueDaily.totalRevenueCents,
      totalOrders: schema.revenueDaily.totalOrders,
      bundleOrders: schema.revenueDaily.bundleOrders,
    })
    .from(schema.revenueDaily)
    .where(
      and(
        eq(schema.revenueDaily.shopId, shopId),
        gte(schema.revenueDaily.date, range.startDate),
        lte(schema.revenueDaily.date, range.endDate),
      ),
    );

  const totalRevenueCents = rows.reduce((s, r) => s + r.totalRevenueCents, 0);
  const totalOrders = rows.reduce((s, r) => s + r.totalOrders, 0);
  const bundleOrders = rows.reduce((s, r) => s + r.bundleOrders, 0);
  const revenueSeries = rows.map((r) => ({ date: r.date, cents: r.totalRevenueCents }));
  const ordersSeries = rows.map((r) => ({ date: r.date, count: r.totalOrders }));

  return { totalRevenueCents, totalOrders, bundleOrders, revenueSeries, ordersSeries };
}

// 2. Activity — per-day application counts grouped by date with perBundle breakdown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActivitySeries(db: any, shopId: string, range: DateRange, bundleIds?: string[]) {
  const baseConds = [
    eq(schema.bundleDaily.shopId, shopId),
    gte(schema.bundleDaily.date, range.startDate),
    lte(schema.bundleDaily.date, range.endDate),
  ];
  if (bundleIds && bundleIds.length > 0) {
    baseConds.push(inArray(schema.bundleDaily.bundleId, bundleIds));
  }

  const rows: Array<{
    date: string;
    bundleId: string;
    applicationCount: number;
  }> = await db
    .select({
      date: schema.bundleDaily.date,
      bundleId: schema.bundleDaily.bundleId,
      applicationCount: schema.bundleDaily.applicationCount,
    })
    .from(schema.bundleDaily)
    .where(and(...baseConds));

  const byDate = new Map<string, { count: number; perBundle: Record<string, number> }>();
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? { count: 0, perBundle: {} };
    entry.count += r.applicationCount;
    entry.perBundle[r.bundleId] = (entry.perBundle[r.bundleId] ?? 0) + r.applicationCount;
    byDate.set(r.date, entry);
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, ...v }));
}

// 3. Conversions + Sales — bundle vs qb series for both conversions and sales
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getConversionsAndSales(db: any, shopId: string, range: DateRange) {
  const rows: Array<{
    date: string;
    bundleOrders: number;
    qbOrders: number;
    bundleRevenueCents: number;
    qbRevenueCents: number;
  }> = await db
    .select({
      date: schema.revenueDaily.date,
      bundleOrders: schema.revenueDaily.bundleOrders,
      qbOrders: schema.revenueDaily.qbOrders,
      bundleRevenueCents: schema.revenueDaily.bundleRevenueCents,
      qbRevenueCents: schema.revenueDaily.qbRevenueCents,
    })
    .from(schema.revenueDaily)
    .where(
      and(
        eq(schema.revenueDaily.shopId, shopId),
        gte(schema.revenueDaily.date, range.startDate),
        lte(schema.revenueDaily.date, range.endDate),
      ),
    );

  return {
    conversions: rows.map((r) => ({ date: r.date, bundleOrders: r.bundleOrders, qbOrders: r.qbOrders })),
    sales: rows.map((r) => ({ date: r.date, bundleCents: r.bundleRevenueCents, qbCents: r.qbRevenueCents })),
  };
}

// 4. Top bundles — SUM by bundle_id sorted by revenue desc, limit 10, joins for names, computes conversion rate
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTopBundles(db: any, shopId: string, range: DateRange) {
  const rows: Array<{
    bundleId: string;
    widgetType: "bundle" | "qb" | "mix_match";
    revenueCents: number;
    orders: number;
    applicationCount: number;
  }> = await db
    .select({
      bundleId: schema.bundleDaily.bundleId,
      widgetType: schema.bundleDaily.widgetType,
      revenueCents: sql<number>`SUM(${schema.bundleDaily.revenueCents})`.as("revenueCents"),
      orders: sql<number>`SUM(${schema.bundleDaily.orders})`.as("orders"),
      applicationCount: sql<number>`SUM(${schema.bundleDaily.applicationCount})`.as("applicationCount"),
    })
    .from(schema.bundleDaily)
    .where(
      and(
        eq(schema.bundleDaily.shopId, shopId),
        gte(schema.bundleDaily.date, range.startDate),
        lte(schema.bundleDaily.date, range.endDate),
      ),
    )
    .groupBy(schema.bundleDaily.bundleId, schema.bundleDaily.widgetType)
    .orderBy(desc(sql`SUM(${schema.bundleDaily.revenueCents})`))
    .limit(10);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.bundleId);

  const bundleNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.bundles.id, name: schema.bundles.name })
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), inArray(schema.bundles.id, ids)));

  const qbNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.quantityBreaks.id, name: schema.quantityBreaks.name })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));

  const nameMap = new Map<string, string>();
  for (const b of bundleNames) nameMap.set(b.id, b.name);
  for (const q of qbNames) nameMap.set(q.id, q.name);

  return rows.map((r) => ({
    bundleId: r.bundleId,
    widgetType: r.widgetType,
    name: nameMap.get(r.bundleId) ?? "(deleted)",
    revenueCents: r.revenueCents,
    orders: r.orders,
    applicationCount: r.applicationCount,
    conversionRate: r.applicationCount > 0 ? r.orders / r.applicationCount : 0,
  }));
}

// 5. QB tier breakdown — groups events by widget_id + tier_qty for QB add_to_cart events
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getQbTierBreakdown(db: any, shopId: string, range: DateRange) {
  const startTs = Date.parse(range.startDate + "T00:00:00Z");
  const endTs = Date.parse(range.endDate + "T23:59:59Z");

  const rows: Array<{
    widgetId: string;
    tierQty: number | null;
    addCount: number;
    valueCents: number;
  }> = await db
    .select({
      widgetId: schema.events.widgetId,
      tierQty: schema.events.tierQty,
      addCount: sql<number>`COUNT(*)`.as("addCount"),
      valueCents: sql<number>`SUM(${schema.events.valueCents})`.as("valueCents"),
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.shopId, shopId),
        eq(schema.events.widgetType, "qb"),
        eq(schema.events.type, "add_to_cart"),
        gte(schema.events.ts, startTs),
        lte(schema.events.ts, endTs),
      ),
    )
    .groupBy(schema.events.widgetId, schema.events.tierQty);

  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.widgetId))];

  const qbNames: Array<{ id: string; name: string }> = await db
    .select({ id: schema.quantityBreaks.id, name: schema.quantityBreaks.name })
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), inArray(schema.quantityBreaks.id, ids)));

  const nameMap = new Map<string, string>();
  for (const q of qbNames) nameMap.set(q.id, q.name);

  const grouped = new Map<string, {
    qbId: string;
    qbName: string;
    tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }>;
  }>();

  for (const r of rows) {
    const key = r.widgetId;
    const entry = grouped.get(key) ?? {
      qbId: r.widgetId,
      qbName: nameMap.get(r.widgetId) ?? "(deleted)",
      tiers: [],
    };
    entry.tiers.push({
      qty: r.tierQty ?? 1,
      addCount: r.addCount,
      estimatedRevenueCents: r.valueCents,
    });
    grouped.set(key, entry);
  }

  return [...grouped.values()];
}

// 6. Bundle list for filter — simple list of all bundles + qbs for filter checkboxes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getBundleListForFilter(db: any, shopId: string) {
  const bundles: Array<{ id: string; name: string; status: string; mode: string }> = await db
    .select({
      id: schema.bundles.id,
      name: schema.bundles.name,
      status: schema.bundles.status,
      mode: schema.bundles.mode,
    })
    .from(schema.bundles)
    .where(eq(schema.bundles.shopId, shopId));

  const qbs: Array<{ id: string; name: string; status: string }> = await db
    .select({
      id: schema.quantityBreaks.id,
      name: schema.quantityBreaks.name,
      status: schema.quantityBreaks.status,
    })
    .from(schema.quantityBreaks)
    .where(eq(schema.quantityBreaks.shopId, shopId));

  return [
    ...bundles.map((b) => ({
      id: b.id,
      name: b.name,
      widgetType: (b.mode === "mix_match" ? "mix_match" : "bundle") as "bundle" | "mix_match",
      status: b.status,
    })),
    ...qbs.map((q) => ({
      id: q.id,
      name: q.name,
      widgetType: "qb" as const,
      status: q.status,
    })),
  ];
}
