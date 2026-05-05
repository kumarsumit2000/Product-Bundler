import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { eq } from "drizzle-orm";

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { topic, shop, session } = await authenticate.webhook(request, ctx);

  if (topic !== "APP_UNINSTALLED") {
    return new Response("Unexpected topic", { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .update(schema.shops)
    .set({ uninstalledAt: new Date() })
    .where(eq(schema.shops.id, shop));

  if (session) {
    await ctx.cloudflare.env.SESSIONS.delete(`session:${session.id}`);
    await ctx.cloudflare.env.SESSIONS.delete(`shop-index:${shop}:${session.id}`);
  }

  return new Response(null, { status: 200 });
}
