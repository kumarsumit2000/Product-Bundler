import { describe, it, expect, vi } from "vitest";
import { createSubscription } from "../app/lib/billing/subscription";

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
