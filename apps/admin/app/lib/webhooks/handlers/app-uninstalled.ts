import { eq } from "drizzle-orm";
import type { AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function handleAppUninstalled(
  ctx: AppLoadContext,
  shop: string,
): Promise<void> {
  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
}
