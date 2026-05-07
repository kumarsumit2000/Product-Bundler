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
  options: { test?: boolean } = {},
): Promise<{ confirmationUrl: string; chargeId: string }> {
  const plan = PLANS[planId];
  const baseAmount = (plan.priceCents / 100).toFixed(2);
  const overageAmount = (plan.overageCents / 100).toFixed(2);

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    test: options.test ?? false,
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

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        lineItems {
          id
          plan { pricingDetails { __typename } }
        }
      }
    }
  }
`;

const APP_USAGE_RECORD_CREATE = `#graphql
  mutation AppUsageRecordCreate(
    $subscriptionLineItemId: ID!
    $price: MoneyInput!
    $description: String!
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $subscriptionLineItemId
      price: $price
      description: $description
    ) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }
`;

export async function submitOverageCharge(
  admin: AdminLike,
  chargeId: string,
  overageCents: number,
  description: string,
): Promise<void> {
  try {
    const lookupResp = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    const lookupBody = (await lookupResp.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions: Array<{
            id: string;
            lineItems: Array<{ id: string; plan: { pricingDetails: { __typename: string } } }>;
          }>;
        };
      };
    };
    const sub = lookupBody.data?.currentAppInstallation?.activeSubscriptions.find((s) => s.id === chargeId);
    if (!sub) {
      console.warn(`[billing] submitOverageCharge: subscription ${chargeId} not active; skipping`);
      return;
    }
    const usageLine = sub.lineItems.find((li) => li.plan.pricingDetails.__typename === "AppUsagePricing");
    if (!usageLine) {
      console.warn(`[billing] submitOverageCharge: subscription ${chargeId} has no usage line item; skipping`);
      return;
    }
    const amount = (overageCents / 100).toFixed(2);
    const createResp = await admin.graphql(APP_USAGE_RECORD_CREATE, {
      variables: {
        subscriptionLineItemId: usageLine.id,
        price: { amount, currencyCode: "USD" },
        description,
      },
    });
    const createBody = (await createResp.json()) as {
      data?: { appUsageRecordCreate?: { userErrors: Array<{ field: string[]; message: string }> } };
    };
    const errors = createBody.data?.appUsageRecordCreate?.userErrors ?? [];
    if (errors.length > 0) {
      console.warn(`[billing] appUsageRecordCreate userErrors: ${errors.map((e) => e.message).join("; ")}`);
    }
  } catch (err) {
    console.error("[billing] submitOverageCharge failed", err);
  }
}
