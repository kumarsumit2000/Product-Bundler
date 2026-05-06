import type { AppLoadContext } from "~/shopify.server";

const PREFIX = "webhook-id:";
const TTL_SECONDS = 60 * 60 * 24 * 7;

export async function wasProcessed(
  ctx: AppLoadContext,
  request: Request,
): Promise<boolean> {
  const id = request.headers.get("X-Shopify-Webhook-Id");
  if (!id) return false;
  const existing = await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.get(PREFIX + id);
  return existing !== null;
}

export async function markProcessed(
  ctx: AppLoadContext,
  request: Request,
): Promise<void> {
  const id = request.headers.get("X-Shopify-Webhook-Id");
  if (!id) return;
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.put(PREFIX + id, "1", {
    expirationTtl: TTL_SECONDS,
  });
}
