import { and, eq, gt, sql, asc } from "drizzle-orm";
import { schema } from "~/db.server";

const BATCH_SIZE = 5000;

// Resume from where the last run left off (per shop), batch through new
// events, and accumulate impression / click / atc counters into bundle_daily.
// Idempotent on re-run as long as we advance the watermark monotonically.
// Designed to be invoked hourly via an external cron service hitting the
// /api/cron/aggregate endpoint — Pages projects can't run [triggers] crons
// natively.
export async function aggregateAllShops(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ shops: number; events: number }> {
  const shops = await db.select({ id: schema.shops.id }).from(schema.shops);
  let totalEvents = 0;
  for (const row of shops as { id: string }[]) {
    totalEvents += await aggregateShop(db, row.id);
  }
  return { shops: shops.length, events: totalEvents };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function aggregateShop(db: any, shopId: string): Promise<number> {
  const state = (
    await db
      .select()
      .from(schema.eventAggregationState)
      .where(eq(schema.eventAggregationState.shopId, shopId))
      .limit(1)
  )[0] as { lastAggregatedTs: number } | undefined;
  const since = state?.lastAggregatedTs ?? 0;

  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.shopId, shopId), gt(schema.events.ts, since)))
    .orderBy(asc(schema.events.ts))
    .limit(BATCH_SIZE);

  if ((events as unknown[]).length === 0) return 0;

  // Roll up in memory, then UPSERT one row per (date, bundleId).
  type Bucket = { impressions: number; clicks: number; atc: number; widgetType: "bundle" | "qb" | "mix_match" };
  const buckets = new Map<string, Bucket>();
  let maxTs = since;
  for (const e of events as Array<{ ts: number; type: string; widgetType: "bundle" | "qb" | "mix_match"; widgetId: string }>) {
    if (e.ts > maxTs) maxTs = e.ts;
    const date = new Date(e.ts).toISOString().slice(0, 10);
    const key = `${date}|${e.widgetId}|${e.widgetType}`;
    const b = buckets.get(key) ?? { impressions: 0, clicks: 0, atc: 0, widgetType: e.widgetType };
    if (e.type === "widget_impression") b.impressions++;
    else if (e.type === "widget_click") b.clicks++;
    else if (e.type === "add_to_cart") b.atc++;
    buckets.set(key, b);
  }

  for (const [key, b] of buckets) {
    const [date, bundleId] = key.split("|");
    await db
      .insert(schema.bundleDaily)
      .values({
        shopId,
        date,
        bundleId,
        widgetType: b.widgetType,
        applicationCount: 0,
        revenueCents: 0,
        orders: 0,
        impressionCount: b.impressions,
        clickCount: b.clicks,
        atcCount: b.atc,
      })
      .onConflictDoUpdate({
        target: [schema.bundleDaily.shopId, schema.bundleDaily.date, schema.bundleDaily.bundleId],
        set: {
          impressionCount: sql`${schema.bundleDaily.impressionCount} + ${b.impressions}`,
          clickCount: sql`${schema.bundleDaily.clickCount} + ${b.clicks}`,
          atcCount: sql`${schema.bundleDaily.atcCount} + ${b.atc}`,
        },
      });
  }

  // Advance the watermark.
  await db
    .insert(schema.eventAggregationState)
    .values({ shopId, lastAggregatedTs: maxTs })
    .onConflictDoUpdate({
      target: schema.eventAggregationState.shopId,
      set: { lastAggregatedTs: maxTs },
    });

  return (events as unknown[]).length;
}
