import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  // The actual plan flip happens via app_subscriptions/update webhook.
  // Here we just bounce the merchant back to the billing page where
  // they'll see "Pending" until the webhook arrives.
  return redirect("/app/billing");
}
