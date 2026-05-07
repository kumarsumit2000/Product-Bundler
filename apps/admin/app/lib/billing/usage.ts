import { eq } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";

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
