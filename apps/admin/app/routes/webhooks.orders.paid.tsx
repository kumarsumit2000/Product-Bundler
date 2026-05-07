import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb } from "~/db.server";
import { parseOrderAttribution } from "~/lib/analytics/attribution";
import { applyAttribution } from "~/lib/analytics/revenue-rollup";

function deriveOrderDate(order: { processed_at?: string; created_at?: string }): string {
  const raw = order.processed_at ?? order.created_at;
  const date = raw ? new Date(raw) : new Date();
  return date.toISOString().slice(0, 10);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "ORDERS_PAID") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  const parsed = await parseOrderAttribution(
    db,
    shop,
    payload as {
      line_items: Array<{
        price_set: { shop_money: { amount: string } };
        quantity: number;
        properties: Array<{ name: string; value: string }>;
      }>;
    },
  );

  if (parsed.perBundle.length > 0) {
    const orderDate = deriveOrderDate(
      payload as { processed_at?: string; created_at?: string },
    );
    await applyAttribution(db, shop, parsed, orderDate);
  }

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
