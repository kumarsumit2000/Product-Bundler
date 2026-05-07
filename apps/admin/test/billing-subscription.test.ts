import { describe, it, expect, vi } from "vitest";
import { createSubscription, cancelSubscription, submitOverageCharge } from "../app/lib/billing/subscription";

type GqlMock = ReturnType<typeof vi.fn>;
function makeAdmin(graphql: GqlMock) {
  // mimics shape returned by authenticate.admin → { admin: { graphql } }
  return { graphql } as unknown as Parameters<typeof createSubscription>[0];
}

describe("createSubscription", () => {
  it("calls appSubscriptionCreate with correct variables for starter", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            appSubscription: { id: "gid://shopify/AppSubscription/123" },
            confirmationUrl: "https://shopify.example/confirm/abc",
            userErrors: [],
          },
        },
      }),
    });

    const result = await createSubscription(
      makeAdmin(graphql),
      "s.myshopify.com",
      "starter",
      "https://app.example/billing/callback",
    );

    expect(result.confirmationUrl).toBe("https://shopify.example/confirm/abc");
    expect(result.chargeId).toBe("gid://shopify/AppSubscription/123");

    expect(graphql).toHaveBeenCalledOnce();
    const [, opts] = graphql.mock.calls[0]!;
    expect(opts.variables.name).toBe("Starter");
    expect(opts.variables.test).toBe(true); // dev store testing
    expect(opts.variables.trialDays).toBe(7);
    expect(opts.variables.returnUrl).toBe("https://app.example/billing/callback");
    expect(opts.variables.lineItems).toHaveLength(2);
    const recurringLine = opts.variables.lineItems.find((l: { plan: { appRecurringPricingDetails?: unknown } }) => l.plan.appRecurringPricingDetails);
    expect(recurringLine.plan.appRecurringPricingDetails.price.amount).toBe("19.00");
    expect(recurringLine.plan.appRecurringPricingDetails.price.currencyCode).toBe("USD");
    const usageLine = opts.variables.lineItems.find((l: { plan: { appUsagePricingDetails?: unknown } }) => l.plan.appUsagePricingDetails);
    expect(usageLine.plan.appUsagePricingDetails.cappedAmount.amount).toBe("10000.00");
    expect(usageLine.plan.appUsagePricingDetails.terms).toMatch(/0\.05.*order/i);
  });

  it("throws when userErrors present", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          appSubscriptionCreate: {
            appSubscription: null,
            confirmationUrl: null,
            userErrors: [{ field: ["name"], message: "App is not configured for billing" }],
          },
        },
      }),
    });
    await expect(
      createSubscription(makeAdmin(graphql), "s.myshopify.com", "growth", "https://app.example/cb"),
    ).rejects.toThrow(/not configured/);
  });
});

describe("cancelSubscription", () => {
  it("calls appSubscriptionCancel with the chargeId", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { appSubscriptionCancel: { appSubscription: { id: "gid://shopify/AppSubscription/123", status: "CANCELLED" }, userErrors: [] } },
      }),
    });
    await cancelSubscription(makeAdmin(graphql), "gid://shopify/AppSubscription/123");
    expect(graphql).toHaveBeenCalledOnce();
    const [, opts] = graphql.mock.calls[0]!;
    expect(opts.variables.id).toBe("gid://shopify/AppSubscription/123");
  });

  it("throws when userErrors present", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { appSubscriptionCancel: { appSubscription: null, userErrors: [{ field: ["id"], message: "Subscription not found" }] } },
      }),
    });
    await expect(
      cancelSubscription(makeAdmin(graphql), "gid://shopify/AppSubscription/999"),
    ).rejects.toThrow(/not found/);
  });
});

describe("submitOverageCharge", () => {
  it("queries activeSubscriptions, finds usage line item, then calls appUsageRecordCreate", async () => {
    const graphql = vi.fn()
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            currentAppInstallation: {
              activeSubscriptions: [
                {
                  id: "gid://shopify/AppSubscription/123",
                  lineItems: [
                    { id: "gid://shopify/AppSubscriptionLineItem/r1", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
                    { id: "gid://shopify/AppSubscriptionLineItem/u1", plan: { pricingDetails: { __typename: "AppUsagePricing" } } },
                  ],
                },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: { appUsageRecordCreate: { appUsageRecord: { id: "gid://shopify/AppUsageRecord/x" }, userErrors: [] } },
        }),
      });

    await submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "Order overage: 1 order @ $0.05");

    expect(graphql).toHaveBeenCalledTimes(2);
    const [, createOpts] = graphql.mock.calls[1]!;
    expect(createOpts.variables.subscriptionLineItemId).toBe("gid://shopify/AppSubscriptionLineItem/u1");
    expect(createOpts.variables.price.amount).toBe("0.05");
    expect(createOpts.variables.description).toBe("Order overage: 1 order @ $0.05");
  });

  it("does not throw on errors (fire-and-forget) — logs only", async () => {
    const graphql = vi.fn().mockRejectedValue(new Error("network"));
    // should resolve, not reject
    await expect(
      submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "x"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when subscription has no usage line", async () => {
    const graphql = vi.fn().mockResolvedValueOnce({
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/123",
                lineItems: [
                  { id: "gid://shopify/AppSubscriptionLineItem/r1", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } },
                ],
              },
            ],
          },
        },
      }),
    });
    await expect(
      submitOverageCharge(makeAdmin(graphql), "gid://shopify/AppSubscription/123", 5, "x"),
    ).resolves.toBeUndefined();
    expect(graphql).toHaveBeenCalledOnce(); // didn't proceed to mutation
  });
});
