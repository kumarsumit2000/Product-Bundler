import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import type { AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");

  // Embedded entry: Shopify launches the app at our root URL (no /app suffix).
  // Forward to /app same-origin so the embedded auth + bounce flow runs inside
  // the iframe. A cross-origin redirect to admin.shopify.com here would be
  // X-Frame-Options blocked.
  if (shop && host) {
    const params = new URLSearchParams(url.searchParams);
    params.set("embedded", "1");
    return redirect(`/app?${params.toString()}`);
  }

  // Top-level visit (no shop/host): try to bounce into the embedded admin shell
  // if we at least know the shop, otherwise start the install flow.
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
