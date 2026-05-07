import { PLANS, type PlanId } from "~/lib/billing/plans";

// Loose admin shape — matches the surface we use from @shopify/shopify-app-remix.
// Real type is AdminApiContext from server SDK; tests pass a mock with the same `graphql` method.
export type AdminLike = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<{ data?: unknown; errors?: unknown }> }>;
};

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $trialDays: Int
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      trialDays: $trialDays
      test: $test
      lineItems: $lineItems
    ) {
      appSubscription { id }
      confirmationUrl
      userErrors { field message }
    }
  }
`;

export async function createSubscription(
  admin: AdminLike,
  shop: string,
  planId: Exclude<PlanId, "free">,
  returnUrl: string,
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const plan = PLANS[planId];
  const baseAmount = (plan.priceCents / 100).toFixed(2);
  const overageAmount = (plan.overageCents / 100).toFixed(2);

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    // Set true for dev stores; Shopify ignores on production stores.
    test: true,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: baseAmount, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: "10000.00", currencyCode: "USD" },
            terms: `$${overageAmount} per order over the ${plan.orderCap} included orders`,
          },
        },
      },
    ],
  };

  const resp = await admin.graphql(APP_SUBSCRIPTION_CREATE, { variables });
  const body = (await resp.json()) as {
    data?: {
      appSubscriptionCreate?: {
        appSubscription: { id: string } | null;
        confirmationUrl: string | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const out = body.data?.appSubscriptionCreate;
  if (!out || out.userErrors.length > 0) {
    const msg = out?.userErrors.map((e) => e.message).join("; ") ?? "Unknown error";
    throw new Error(`appSubscriptionCreate failed: ${msg}`);
  }
  if (!out.appSubscription || !out.confirmationUrl) {
    throw new Error("appSubscriptionCreate returned no subscription/confirmationUrl");
  }
  return { confirmationUrl: out.confirmationUrl, chargeId: out.appSubscription.id };
}

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }
`;

export async function cancelSubscription(admin: AdminLike, chargeId: string): Promise<void> {
  const resp = await admin.graphql(APP_SUBSCRIPTION_CANCEL, { variables: { id: chargeId } });
  const body = (await resp.json()) as {
    data?: { appSubscriptionCancel?: { userErrors: Array<{ field: string[]; message: string }> } };
  };
  const errors = body.data?.appSubscriptionCancel?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`appSubscriptionCancel failed: ${errors.map((e) => e.message).join("; ")}`);
  }
}
