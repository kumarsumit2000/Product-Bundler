import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { handleShopRedact } from "~/lib/webhooks/handlers/shop-redact";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "SHOP_REDACT") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  await handleShopRedact(ctx, shop);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
