import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import type { AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;

  // Shopify's billing approval redirect lands the browser on our raw domain
  // (top-level navigation, no Bearer token, not inside the embedded admin
  // iframe). Calling authenticate.admin here would just bounce to /auth/login
  // and trap the merchant. Skip it — the request is HMAC-signed by Shopify
  // and the actual plan flip happens via the app_subscriptions/update webhook.
  // Our only job is to ferry the merchant back into the embedded admin shell.

  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shop = url.searchParams.get("shop");

  // Build the embedded admin URL. Pattern is:
  //   https://admin.shopify.com/store/{shop-handle}/apps/{api-key}/app/billing
  // We construct it from `host` (which decodes to "admin.shopify.com/store/<handle>")
  // when present, or from the `shop` param as a fallback.
  let embeddedUrl: string | null = null;
  if (host) {
    let normalized = host.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    try {
      const decoded = atob(normalized).replace(/\/+$/, "");
      embeddedUrl = `https://${decoded}/apps/${ctx.cloudflare.env.SHOPIFY_API_KEY}/app/billing`;
    } catch {
      embeddedUrl = null;
    }
  }
  if (!embeddedUrl && shop) {
    const handle = shop.replace(/\.myshopify\.com$/, "");
    embeddedUrl = `https://admin.shopify.com/store/${handle}/apps/${ctx.cloudflare.env.SHOPIFY_API_KEY}/app/billing`;
  }

  if (!embeddedUrl) return redirect("/app/billing");

  // Render an HTML response that breaks out of any iframe context via
  // window.top.location. A 302 Location works in most browsers, but if the
  // post-approval response is loaded inside Shopify's iframe wrapper the
  // browser follows the redirect inside the iframe and CSP can break it.
  // window.top.location guarantees a top-level navigation.
  const safeUrl = embeddedUrl.replace(/"/g, "&quot;");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting…</title>
<meta http-equiv="refresh" content="0; url=${safeUrl}">
<script>
  (function () {
    var u = ${JSON.stringify(embeddedUrl)};
    try { window.top.location.href = u; } catch (e) { window.location.href = u; }
  })();
</script>
</head><body><p>Redirecting back to your store…</p>
<p><a href="${safeUrl}">Click here if you are not redirected.</a></p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
