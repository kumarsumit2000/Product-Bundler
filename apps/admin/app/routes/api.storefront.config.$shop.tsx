import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { unauthenticated, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { buildStorefrontConfig } from "~/lib/storefront-config";
import { checkRateLimit } from "~/lib/rate-limit";

const CACHE_TTL_SECONDS = 60;
// Cloudflare KV's minimum expirationTtl is 60s; using anything lower throws
// "Invalid expiration_ttl" and surfaces as a 500 to the storefront.
const NEGATIVE_CACHE_TTL_SECONDS = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const shop = decodeURIComponent(params.shop ?? "").toLowerCase();

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return new Response(JSON.stringify({ error: "Invalid shop" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Per-shop rate limit (BFS hard constraint). KV-bucketed counter — the
  // widget loads this endpoint at most once per page load, so 1000/min/shop
  // is many orders of magnitude above legitimate traffic.
  const rl = await checkRateLimit(env.SHOP_SETTINGS_CACHE, shop);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  // Cache hit — serve immediately
  const cacheKey = `config:${shop}`;
  const cached = await env.SHOP_SETTINGS_CACHE.get(cacheKey, "text");
  if (cached) {
    return new Response(cached, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
        "X-Pumper-Cache": "HIT",
      },
    });
  }

  // Verify shop is installed
  const db = getDb(env.DB);
  const shopRow = (
    await db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, shop))
      .limit(1)
  )[0];

  if (!shopRow || shopRow.uninstalledAt) {
    return new Response(JSON.stringify({ error: "Shop not found" }), {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Build payload using unauthenticated admin client (uses offline token from KV session storage)
  const { admin } = await unauthenticated.admin(shop, ctx);
  const payload = await buildStorefrontConfig(db, admin, shop);
  const json = JSON.stringify(payload);

  const isEmpty =
    payload.bundles.length === 0 &&
    payload.quantityBreaks.length === 0 &&
    (payload.bxgyOffers?.length ?? 0) === 0 &&
    (payload.progressiveGifts?.length ?? 0) === 0 &&
    (payload.countdowns?.length ?? 0) === 0 &&
    !payload.newsletter;
  const ttl = isEmpty ? NEGATIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

  await env.SHOP_SETTINGS_CACHE.put(cacheKey, json, {
    expirationTtl: ttl,
  });

  return new Response(json, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
      "X-Pumper-Cache": "MISS",
    },
  });
}
