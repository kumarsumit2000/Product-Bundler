import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { wasProcessed, markProcessed } from "~/lib/webhooks/idempotency";
import { purgeKvForShop } from "~/lib/webhooks/cleanup";

export async function handleAppUninstalled(
  ctx: AppLoadContext,
  shop: string,
): Promise<void> {
  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));
  await purgeKvForShop(ctx.cloudflare.env.SESSIONS, shop);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unexpected topic", { status: 400 });
  }

  if (await wasProcessed(ctx, request)) {
    return new Response(null, { status: 200 });
  }

  await handleAppUninstalled(ctx, shop);
  await markProcessed(ctx, request);
  return new Response(null, { status: 200 });
}
