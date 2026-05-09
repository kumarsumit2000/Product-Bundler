import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import type { AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;

  // Shopify's billing approval redirect is a top-level navigation back to our
  // raw domain (no App Bridge, no Bearer token), so authenticate.admin would
  // bounce the merchant to /auth/login instead of letting them re-enter the
  // app. Skip auth here — the request is HMAC-signed by Shopify and we just
  // need to ferry the merchant back into the embedded admin shell.
  //
  // The actual plan flip happens via the app_subscriptions/update webhook;
  // this callback's only job is the redirect.
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  if (host) {
    // host is base64url-encoded "admin.shopify.com/store/<handle>" (with or
    // without trailing slash). Both atob and the unpadded base64url variant
    // need to handle a missing pad — pad to multiple of 4 first.
    let normalized = host.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    let decoded: string;
    try {
      decoded = atob(normalized);
    } catch {
      return redirect("/app/billing");
    }
    const embeddedUrl = `https://${decoded.replace(/\/+$/, "")}/apps/${ctx.cloudflare.env.SHOPIFY_API_KEY}/app/billing`;
    return redirect(embeddedUrl);
  }

  return redirect("/app/billing");
}
