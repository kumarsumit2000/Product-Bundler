import { eq } from "drizzle-orm";
import type { AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function handleShopRedact(
  ctx: AppLoadContext,
  shop: string,
): Promise<void> {
  const db = getDb(ctx.cloudflare.env.DB);
  await db.delete(schema.shops).where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${shop}`);
}
