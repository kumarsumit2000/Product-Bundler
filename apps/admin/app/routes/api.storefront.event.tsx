import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";

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
  let event: { type?: string; shop?: string };
  try {
    event = JSON.parse(text);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS_HEADERS });
  }

  const shop = (event.shop ?? "").toLowerCase();
  if (!shop) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const db = getDb(env.DB);
  const row = (await db.select().from(schema.shops).where(eq(schema.shops.id, shop)).limit(1))[0];
  if (!row || row.uninstalledAt) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Phase 4 stub: Analytics Engine binding wired in Phase 6.
  // If env.ANALYTICS exists at runtime (future), write here. Otherwise no-op.
  const anyEnv = env as unknown as { ANALYTICS?: { writeDataPoint(p: unknown): void } };
  if (anyEnv.ANALYTICS && typeof anyEnv.ANALYTICS.writeDataPoint === "function") {
    try {
      anyEnv.ANALYTICS.writeDataPoint({
        blobs: [String(event.type ?? ""), shop],
        doubles: [],
        indexes: [shop],
      });
    } catch {
      // swallow
    }
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
