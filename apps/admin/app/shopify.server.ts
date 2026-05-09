import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { KvSessionStorage } from "./session-storage.server";

// Plan definitions for the Shopify-app-remix billing helper. Names must match
// what we pass to billing.request({ plan: <name> }) in the action.
export const BILLING_PLANS = {
  Starter: {
    lineItems: [
      {
        amount: 19,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days as const,
      },
    ],
    trialDays: 7,
  },
  Growth: {
    lineItems: [
      {
        amount: 49,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days as const,
      },
    ],
    trialDays: 7,
  },
  Unlimited: {
    lineItems: [
      {
        amount: 99,
        currencyCode: "USD",
        interval: BillingInterval.Every30Days as const,
      },
    ],
    trialDays: 7,
  },
};

export type AppLoadContext = {
  cloudflare: {
    env: {
      DB: D1Database;
      SESSIONS: KVNamespace;
      SHOP_SETTINGS_CACHE: KVNamespace;
      WIDGET_ASSETS: R2Bucket;
      ANALYTICS: AnalyticsEngineDataset;
      SHOPIFY_APP_URL: string;
      SCOPES: string;
      SHOPIFY_API_KEY: string;
      SHOPIFY_API_SECRET: string;
      SHOPIFY_WEBHOOK_SECRET: string;
      DATABASE_ENCRYPTION_KEY: string;
    };
  };
};

export function createShopifyApp(context: AppLoadContext) {
  const env = context.cloudflare.env;
  return shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.October25,
    scopes: env.SCOPES.split(","),
    appUrl: env.SHOPIFY_APP_URL,
    authPathPrefix: "/auth",
    sessionStorage: new KvSessionStorage(env.SESSIONS, env.DATABASE_ENCRYPTION_KEY),
    distribution: AppDistribution.AppStore,
    // Token Exchange (Shopify managed install) is the default in v4 — no flag needed.
    billing: BILLING_PLANS,
  });
}

export const authenticate = {
  admin: (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.admin(request);
  },
  webhook: (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.webhook(request);
  },
};

export const unauthenticated = {
  admin: (shop: string, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.unauthenticated.admin(shop);
  },
};
