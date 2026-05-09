import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Button,
  Banner,
  ProgressBar,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { PLANS, type PlanId, isPaidPlan } from "~/lib/billing/plans";
import { getUsage } from "~/lib/billing/usage";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);

  const shopRow = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1)
  )[0];
  const usage = await getUsage(db, session.shop);

  return json({
    plan: usage.plan,
    usage,
    trialEndsAt: shopRow?.trialEndsAt?.toISOString() ?? null,
    chargeId: shopRow?.shopifyChargeId ?? null,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const result = await authenticate.admin(request, ctx) as unknown as {
    session: { shop: string };
    billing: {
      request: (opts: { plan: string; isTest: boolean; returnUrl: string }) => Promise<never>;
      cancel: (opts: { subscriptionId: string; isTest: boolean; prorate?: boolean }) => Promise<unknown>;
    };
  };
  const { session, billing } = result;
  const db = getDb(ctx.cloudflare.env.DB);

  const form = await request.formData();
  const targetPlan = (form.get("planId") as PlanId) ?? "free";

  const shopRow = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1)
  )[0];
  if (!shopRow) return json({ error: "Shop not found" }, { status: 404 });

  const currentPlan = shopRow.plan as PlanId;
  if (targetPlan === currentPlan) {
    return json({ error: "Already on this plan" }, { status: 400 });
  }

  if (targetPlan === "free") {
    if (shopRow.shopifyChargeId) {
      try {
        await billing.cancel({ subscriptionId: shopRow.shopifyChargeId, isTest: true, prorate: true });
      } catch {
        // Best-effort cancel; the merchant can manually cancel via Shopify if this fails.
      }
    }
    await db
      .update(schema.shops)
      .set({ plan: "free", shopifyChargeId: null, trialEndsAt: null, monthlyOrderResetAt: null })
      .where(eq(schema.shops.id, session.shop));
    return json({ confirmationUrl: null as string | null });
  }

  // Cancel existing paid subscription before creating a new one (paid → paid transition)
  if (shopRow.shopifyChargeId && currentPlan !== "free") {
    try {
      await billing.cancel({ subscriptionId: shopRow.shopifyChargeId, isTest: true, prorate: true });
    } catch {
      // Best-effort cancel.
    }
  }

  // SDK's billing.request() handles managed-install state and the Billing API
  // policy gates that direct admin.graphql calls trip on. It throws a redirect
  // Response that React Router serves as a top-window navigation.
  const planNameMap: Record<Exclude<PlanId, "free">, "Starter" | "Growth" | "Unlimited"> = {
    starter: "Starter",
    growth: "Growth",
    unlimited: "Unlimited",
  };
  // Shopify's billing approval only echoes ?charge_id=X back on this URL —
  // it doesn't preserve `shop` or `host`. Pass shop ourselves so the callback
  // can rebuild the embedded-admin URL and bounce the merchant back inside.
  const returnUrl = `${ctx.cloudflare.env.SHOPIFY_APP_URL}/app/billing/callback?shop=${encodeURIComponent(session.shop)}`;
  await billing.request({
    plan: planNameMap[targetPlan],
    isTest: true, // flip to false when launching publicly with real charges
    returnUrl,
  });

  // Unreachable in normal flow — billing.request always throws.
  return json({ error: "Unexpected: billing.request returned" }, { status: 500 });
}

export default function BillingPage() {
  const { plan, usage, trialEndsAt } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ confirmationUrl: string | null }>();
  const isSubmitting = fetcher.state !== "idle";
  const currentPlan = PLANS[plan];

  // When the action returns a confirmationUrl from Shopify, navigate the TOP
  // window (not this iframe). Shopify's billing confirmation page refuses to
  // render inside an embedded-admin iframe. window.open(url, '_top') uses
  // navigation policy (allowed cross-origin) vs setting window.top.location
  // (blocked by same-origin policy).
  useEffect(() => {
    const url = fetcher.data?.confirmationUrl;
    if (url && typeof window !== "undefined") {
      window.open(url, "_top");
    } else if (fetcher.state === "idle" && fetcher.data && fetcher.data.confirmationUrl === null) {
      // Plan downgraded to free — soft-reload this page so loader re-runs.
      window.location.reload();
    }
  }, [fetcher.state, fetcher.data]);

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : 0;
  const trialActive = trialDaysLeft > 0;

  const usageLabel = currentPlan.isLifetimeCap
    ? `${usage.lifetimeOrderCount} / ${currentPlan.orderCap} orders (lifetime)`
    : `${usage.monthlyOrderCount} / ${currentPlan.orderCap} orders this month`;

  function handleSelect(planId: PlanId) {
    fetcher.submit({ planId }, { method: "post" });
  }

  return (
    <Page title="Billing">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {currentPlan.name} — ${(currentPlan.priceCents / 100).toFixed(0)}/mo
              </Text>
              {trialActive && <Badge tone="success">Free trial</Badge>}
            </InlineStack>
            {trialActive && (
              <Text as="p" tone="subdued">
                Free trial · {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining ·
                First charge {new Date(trialEndsAt!).toLocaleDateString()}
              </Text>
            )}
            <Text as="p">{usageLabel}</Text>
            <ProgressBar progress={Math.min(100, usage.percentUsed)} size="small" />
            {!currentPlan.isLifetimeCap && usage.resetAt && (
              <Text as="p" tone="subdued">
                Resets {new Date(usage.resetAt).toLocaleDateString()}
              </Text>
            )}
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 4 }} gap="300">
          {(Object.values(PLANS) as Array<typeof PLANS[PlanId]>).map((p) => {
            const isCurrent = p.id === plan;
            const isHigher = p.priceCents > currentPlan.priceCents;
            const isFreeDowngrade = p.id === "free" && isPaidPlan(plan);
            return (
              <Card key={p.id}>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    {p.name}
                  </Text>
                  <Text as="p" variant="heading2xl">
                    ${(p.priceCents / 100).toFixed(0)}
                    <Text as="span" variant="bodyMd">
                      /mo
                    </Text>
                  </Text>
                  <Text as="p">
                    {p.orderCap} orders{p.isLifetimeCap ? " (lifetime)" : "/month"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {p.id === "free"
                      ? "Lifetime cap — upgrade to continue"
                      : `$${(p.overageCents / 100).toFixed(2)} per extra order`}
                  </Text>
                  <BlockStack gap="100">
                    <Text as="p">• All bundle types</Text>
                    <Text as="p">• All QB tiers</Text>
                    <Text as="p">• Free gift + BOGO</Text>
                    <Text as="p">• Analytics dashboard</Text>
                  </BlockStack>
                  {isCurrent ? (
                    <Button disabled accessibilityLabel="You are on this plan">Current plan</Button>
                  ) : isFreeDowngrade ? (
                    <Button
                      tone="critical"
                      loading={isSubmitting}
                      onClick={() => handleSelect(p.id)}
                    >
                      Cancel subscription
                    </Button>
                  ) : isHigher ? (
                    <Button
                      variant="primary"
                      loading={isSubmitting}
                      onClick={() => handleSelect(p.id)}
                    >
                      Upgrade
                    </Button>
                  ) : (
                    <Button loading={isSubmitting} onClick={() => handleSelect(p.id)}>
                      Downgrade
                    </Button>
                  )}
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>

        <Banner tone="info">
          <Text as="p">
            Charges appear on your Shopify invoice. 7-day free trial on first paid subscription.
          </Text>
        </Banner>
      </BlockStack>
    </Page>
  );
}
