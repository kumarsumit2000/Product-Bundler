import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  const db = getDb(ctx.cloudflare.env.DB);
  const now = new Date();
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: {
        scopes: session.scope ?? "",
        uninstalledAt: null,
      },
    });

  return null;
}
