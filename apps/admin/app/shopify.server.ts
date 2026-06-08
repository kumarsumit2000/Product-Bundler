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
      CRON_TOKEN?: string;
    };
  };
};

export function createShopifyApp(context: AppLoadContext) {
  const env = context.cloudflare.env;
  return shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.January26,
    scopes: env.SCOPES.split(","),
    appUrl: env.SHOPIFY_APP_URL,
    authPathPrefix: "/auth",
    sessionStorage: new KvSessionStorage(env.SESSIONS, env.DATABASE_ENCRYPTION_KEY),
    distribution: AppDistribution.AppStore,
    // Token Exchange (unstable_newEmbeddedAuthStrategy) plus expiring offline
    // tokens. Shopify rejects non-expiring offline tokens at the Admin API
    // gateway with 403 — without expiringOfflineAccessTokens the SDK requests
    // non-expiring tokens by default and every API call dies.
    future: {
      unstable_newEmbeddedAuthStrategy: true,
      expiringOfflineAccessTokens: true,
    },
    billing: BILLING_PLANS,
  });
}

export const authenticate = {
  admin: async (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    const result = await shopify.authenticate.admin(request);
    // Auto-heal the shop row: under `unstable_newEmbeddedAuthStrategy` the
    // legacy /auth/* loader doesn't run on reinstall (token exchange bypasses
    // it), so a stale `uninstalled_at` from a previous uninstall is left in
    // place even after the merchant comes back. That stale value makes the
    // storefront-config endpoint return 404 for the shop, silently breaking
    // every storefront widget. Upsert on every admin request so the row's
    // install state reflects what the SDK already verified.
    await markShopInstalled(context, result.session.shop, result.session.scope ?? "").catch((err) => {
      console.error("[shopify.auth] markShopInstalled failed:", err);
    });
    return result;
  },
  webhook: (request: Request, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.authenticate.webhook(request);
  },
};

async function markShopInstalled(context: AppLoadContext, shopId: string, scopes: string): Promise<void> {
  // Lazy-import db helpers so this file stays a leaf of the dependency
  // graph (it's imported from every route loader).
  const { getDb, schema } = await import("./db.server");
  const db = getDb(context.cloudflare.env.DB);
  const now = new Date();
  await db
    .insert(schema.shops)
    .values({ id: shopId, scopes, installedAt: now })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: { scopes, uninstalledAt: null },
    });
}

export const unauthenticated = {
  admin: (shop: string, context: AppLoadContext) => {
    const shopify = createShopifyApp(context);
    return shopify.unauthenticated.admin(shop);
  },
};
