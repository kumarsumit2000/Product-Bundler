declare module "cloudflare:test" {
  interface ProvidedEnv {
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
  }
}
