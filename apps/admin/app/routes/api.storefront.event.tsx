import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { writeStorefrontEvent } from "~/lib/analytics/events-write";
import { checkRateLimit } from "~/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const MAX_BODY = 4096;

export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const text = await request.text();
  if (text.length > MAX_BODY) {
    return new Response("Too large", { status: 413, headers: CORS_HEADERS });
  }
  let body: {
    type?: string;
    shop?: string;
    widgetType?: string;
    widgetId?: string;
    productId?: string;
    tierQty?: number;
    valueCents?: number;
    ts?: number;
  };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS_HEADERS });
  }

  const shop = (body.shop ?? "").toLowerCase();
  if (!shop) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Per-shop rate limit. Analytics events are higher-volume than config
  // calls but 1000/min still leaves plenty of headroom for a busy PDP
  // firing impression + click + add-to-cart.
  const rl = await checkRateLimit(env.SHOP_SETTINGS_CACHE, shop);
  if (!rl.allowed) {
    return new Response(null, { status: 429, headers: CORS_HEADERS });
  }

  const db = getDb(env.DB);
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row || row.uninstalledAt) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const VALID_TYPES = ["widget_impression", "widget_click", "add_to_cart"] as const;
  const VALID_WIDGETS = ["bundle", "qb", "mix_match"] as const;
  if (!body.type || !(VALID_TYPES as readonly string[]).includes(body.type)) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!body.widgetType || !(VALID_WIDGETS as readonly string[]).includes(body.widgetType)) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (!body.widgetId || typeof body.widgetId !== "string") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const ts = typeof body.ts === "number" && Number.isFinite(body.ts) ? body.ts : Date.now();

  try {
    await writeStorefrontEvent(db, shop, {
      type: body.type as "widget_impression" | "widget_click" | "add_to_cart",
      widgetType: body.widgetType as "bundle" | "qb" | "mix_match",
      widgetId: body.widgetId,
      productId: body.productId,
      tierQty: body.tierQty,
      valueCents: body.valueCents,
      ts,
    });
  } catch (err) {
    // Fire-and-forget; never block the storefront on a beacon write
    // eslint-disable-next-line no-console
    console.warn("[event-write] failed:", err);
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
