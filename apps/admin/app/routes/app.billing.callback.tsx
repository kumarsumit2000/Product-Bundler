import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);

  // Shopify's billing approval redirect lands the browser on our raw domain
  // (outside the embedded admin iframe), so a relative redirect to /app/billing
  // would just bounce to /auth/login. Reconstruct the embedded admin URL from
  // the `host` query param Shopify includes and break out to it via top-level
  // navigation.
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  if (host) {
    const decoded = atob(host); // e.g. "admin.shopify.com/store/deepseatools"
    const embeddedUrl = `https://${decoded}/apps/${ctx.cloudflare.env.SHOPIFY_API_KEY}/app/billing`;
    return redirect(embeddedUrl);
  }

  // Fallback if Shopify omits the host param (shouldn't happen, but cover it).
  return redirect("/app/billing");
}
