import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import type { AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Top-level navigation onto our domain (e.g., from Shopify billing-approval
  // redirect or someone bookmarking the app URL). If we know the shop, bounce
  // back into the embedded admin shell — otherwise /app routes will just kick
  // to /auth/login because there's no Bearer token outside the iframe.
  if (host || shop) {
    let embeddedHost: string | null = null;
    if (host) {
      let normalized = host.replace(/-/g, "+").replace(/_/g, "/");
      while (normalized.length % 4 !== 0) normalized += "=";
      try {
        embeddedHost = atob(normalized).replace(/\/+$/, "");
      } catch {
        embeddedHost = null;
      }
    }
    if (!embeddedHost && shop) {
      const handle = shop.replace(/\.myshopify\.com$/, "");
      embeddedHost = `admin.shopify.com/store/${handle}`;
    }
    if (embeddedHost) {
      return redirect(
        `https://${embeddedHost}/apps/${ctx.cloudflare.env.SHOPIFY_API_KEY}/app`,
      );
    }
  }

  return redirect("/auth/login");
}

export default function Index() {
  return null;
}
