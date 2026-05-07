import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb, schema } from "~/db.server";
import { parseOrderAttribution } from "~/lib/analytics/attribution";
import { applyAttribution } from "~/lib/analytics/revenue-rollup";
import { incrementOrderCount } from "~/lib/billing/usage";
import { submitOverageCharge } from "~/lib/billing/subscription";
import { PLANS, type PlanId } from "~/lib/billing/plans";

function deriveOrderDate(order: { processed_at?: string; created_at?: string }): string {
  const raw = order.processed_at ?? order.created_at;
  const date = raw ? new Date(raw) : new Date();
  return date.toISOString().slice(0, 10);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const result = await authenticate.webhook(request, ctx);
  const { topic, shop, payload } = result;
  const admin = (result as { admin?: unknown }).admin;

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
    const orderDate = deriveOrderDate(payload as { processed_at?: string; created_at?: string });
    await applyAttribution(db, shop, parsed, orderDate);
  }

  const incResult = await incrementOrderCount(db, shop);

  if (incResult.overageOrders > 0) {
    const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
    if (shopRow?.shopifyChargeId && admin) {
      const planId = (shopRow.plan as PlanId) in PLANS ? (shopRow.plan as PlanId) : "free";
      const overageCents = PLANS[planId].overageCents;
      const description = `Order overage: 1 order @ $${(overageCents / 100).toFixed(2)}`;
      // Fire-and-forget so we stay under Shopify's 5s webhook SLA.
      // ctx.cloudflare may have waitUntil if running on Workers/Pages; otherwise we await directly.
      const wu = (ctx.cloudflare as unknown as { ctx?: { waitUntil?: (p: Promise<unknown>) => void } }).ctx?.waitUntil;
      const promise = submitOverageCharge(
        admin as Parameters<typeof submitOverageCharge>[0],
        shopRow.shopifyChargeId,
        overageCents,
        description,
      );
      if (typeof wu === "function") wu(promise);
      else await promise;
    }
  }

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
