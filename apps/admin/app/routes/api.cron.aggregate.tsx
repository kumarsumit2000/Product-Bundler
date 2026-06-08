import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import { aggregateAllShops } from "~/lib/analytics/aggregate-events";

// Aggregates storefront events into bundle_daily rollups. Designed to be
// triggered hourly by an external cron service:
//
//   GET https://bundler.deepseatools.in/api/cron/aggregate?token=<CRON_TOKEN>
//
// CRON_TOKEN is set as a Cloudflare Pages secret. Any external scheduler
// works — Cloudflare Cron Triggers (separate Worker), cron-job.org,
// EasyCron, GitHub Actions on a schedule, etc.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const env = ctx.cloudflare.env;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || request.headers.get("X-Cron-Token") || "";
  const expected = env.CRON_TOKEN ?? "";

  if (!expected) {
    return new Response("CRON_TOKEN not configured", { status: 503 });
  }
  if (token !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getDb(env.DB);
  const result = await aggregateAllShops(db);
  return new Response(
    JSON.stringify({ ok: true, ...result, at: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } },
  );
}
