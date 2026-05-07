import { eq, sql } from "drizzle-orm";
import { schema } from "~/db.server";
import type { ParsedAttribution } from "./attribution";

export async function applyAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  shopId: string,
  parsed: { totalCents: number; perBundle: ParsedAttribution[] },
  orderDate: string,
): Promise<void> {
  if (parsed.perBundle.length === 0) return;

  const bundleCents = parsed.perBundle
    .filter((p) => p.widgetType !== "qb")
    .reduce((s, p) => s + p.revenueCents, 0);
  const qbCents = parsed.perBundle
    .filter((p) => p.widgetType === "qb")
    .reduce((s, p) => s + p.revenueCents, 0);
  const hasBundle = bundleCents > 0 ? 1 : 0;
  const hasQb = qbCents > 0 ? 1 : 0;

  await db
    .insert(schema.revenueDaily)
    .values({
      shopId,
      date: orderDate,
      totalRevenueCents: parsed.totalCents,
      totalOrders: 1,
      bundleRevenueCents: bundleCents,
      bundleOrders: hasBundle,
      qbRevenueCents: qbCents,
      qbOrders: hasQb,
    })
    .onConflictDoUpdate({
      target: [schema.revenueDaily.shopId, schema.revenueDaily.date],
      set: {
        totalRevenueCents: sql`${schema.revenueDaily.totalRevenueCents} + ${parsed.totalCents}`,
        totalOrders: sql`${schema.revenueDaily.totalOrders} + 1`,
        bundleRevenueCents: sql`${schema.revenueDaily.bundleRevenueCents} + ${bundleCents}`,
        bundleOrders: sql`${schema.revenueDaily.bundleOrders} + ${hasBundle}`,
        qbRevenueCents: sql`${schema.revenueDaily.qbRevenueCents} + ${qbCents}`,
        qbOrders: sql`${schema.revenueDaily.qbOrders} + ${hasQb}`,
      },
    });

  for (const entry of parsed.perBundle) {
    await db
      .insert(schema.bundleDaily)
      .values({
        shopId,
        date: orderDate,
        bundleId: entry.bundleId,
        widgetType: entry.widgetType,
        applicationCount: 1,
        revenueCents: entry.revenueCents,
        orders: 1,
      })
      .onConflictDoUpdate({
        target: [schema.bundleDaily.shopId, schema.bundleDaily.date, schema.bundleDaily.bundleId],
        set: {
          applicationCount: sql`${schema.bundleDaily.applicationCount} + 1`,
          revenueCents: sql`${schema.bundleDaily.revenueCents} + ${entry.revenueCents}`,
          orders: sql`${schema.bundleDaily.orders} + 1`,
        },
      });
  }

  await db
    .update(schema.shops)
    .set({
      attributedRevenueCents: sql`${schema.shops.attributedRevenueCents} + ${parsed.totalCents}`,
    })
    .where(eq(schema.shops.id, shopId));
}
