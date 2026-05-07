import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "COLLECTIONS_UPDATE") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  // Invalidate storefront config cache so Mix & Match collectionProducts
  // refetch within the next 60 s TTL window.
  const shopKey = shop.toLowerCase();
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${shopKey}`);

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
