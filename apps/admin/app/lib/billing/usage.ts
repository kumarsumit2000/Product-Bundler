import { eq } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";
import { PLANS, type PlanId } from "~/lib/billing/plans";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function lazyResetIfDue(db: DB, shop: string, now: Date): Promise<boolean> {
  const row = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1)
  )[0];
  if (!row || !row.monthlyOrderResetAt) return false;
  if (row.monthlyOrderResetAt.getTime() > now.getTime()) return false;

  // Advance by 30d increments until > now (handles dormant shops crossing multiple cycles)
  let nextReset = row.monthlyOrderResetAt.getTime();
  while (nextReset <= now.getTime()) {
    nextReset += THIRTY_DAYS_MS;
  }

  await db
    .update(schema.shops)
    .set({ monthlyOrderCount: 0, monthlyOrderResetAt: new Date(nextReset) })
    .where(eq(schema.shops.id, shop));
  return true;
}

export type IncrementResult = {
  overageOrders: number;
  isOverFreeCap: boolean;
};

export async function incrementOrderCount(db: DB, shop: string): Promise<IncrementResult> {
  await lazyResetIfDue(db, shop, new Date());

  const before = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!before) return { overageOrders: 0, isOverFreeCap: false };

  const planId = before.plan as PlanId;
  const plan = PLANS[planId] ?? PLANS.free;
  const newMonthly = before.monthlyOrderCount + 1;
  const newLifetime = before.lifetimeOrderCount + 1;

  await db
    .update(schema.shops)
    .set({ monthlyOrderCount: newMonthly, lifetimeOrderCount: newLifetime })
    .where(eq(schema.shops.id, shop));

  const isOverFreeCap = plan.isLifetimeCap && newLifetime > plan.orderCap;
  const overageOrders = !plan.isLifetimeCap && newMonthly > plan.orderCap ? 1 : 0;

  return { overageOrders, isOverFreeCap };
}
