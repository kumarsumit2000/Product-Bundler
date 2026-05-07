import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { getDb, schema } from "~/db.server";
import { PLANS, type PlanId } from "~/lib/billing/plans";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function planIdFromName(name: string): PlanId {
  const lower = name.toLowerCase();
  if (lower in PLANS) return lower as PlanId;
  return "free";
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, payload } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  const sub = (payload as {
    app_subscription?: {
      admin_graphql_api_id: string;
      name: string;
      status: string;
      trial_days?: number;
    };
  }).app_subscription;

  if (!sub) {
    await markProcessed(ctx, request);
    return new Response(null, { status: 200 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  const now = new Date();

  if (sub.status === "ACTIVE") {
    const planId = planIdFromName(sub.name);
    const trialDays = sub.trial_days ?? 0;

    // Read current state to detect renewal (same plan + same chargeId = no state change needed)
    const existing = (
      await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1)
    )[0];
    const isRenewal =
      existing &&
      existing.plan === planId &&
      existing.shopifyChargeId === sub.admin_graphql_api_id;

    if (isRenewal) {
      // Renewal — no state change. Shopify fires ACTIVE ~every 30 days.
      console.log(`[billing] subscription renewed for ${shop} (${planId})`);
    } else {
      await db
        .update(schema.shops)
        .set({
          plan: planId,
          shopifyChargeId: sub.admin_graphql_api_id,
          planActivatedAt: now,
          trialEndsAt: trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : null,
          monthlyOrderResetAt: new Date(now.getTime() + THIRTY_DAYS_MS),
          monthlyOrderCount: 0,
        })
        .where(eq(schema.shops.id, shop));
    }
  } else if (
    sub.status === "CANCELLED" ||
    sub.status === "EXPIRED" ||
    sub.status === "DECLINED"
  ) {
    await db
      .update(schema.shops)
      .set({
        plan: "free",
        shopifyChargeId: null,
        trialEndsAt: null,
        monthlyOrderResetAt: null,
      })
      .where(eq(schema.shops.id, shop));
  } else if (sub.status === "FROZEN") {
    console.warn(
      `[billing] subscription frozen for ${shop} (charge ${sub.admin_graphql_api_id})`,
    );
  } else {
    // PENDING, ACCEPTED, etc — log only
    console.log(
      `[billing] app_subscriptions/update status=${sub.status} for ${shop}`,
    );
  }

  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
