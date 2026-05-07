import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { type AppLoadContext } from "~/shopify.server";

// Public route: serves a generic widget preview iframe shell.
// Real config arrives via postMessage from the authenticated parent edit page;
// this HTML doc has no merchant data and no session is required.
export async function loader({ context, params }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const type = String(params.type ?? "bundle");
  if (!["bundle", "qb", "mix_match"].includes(type)) {
    return new Response("Bad type", { status: 400 });
  }

  // Widget assets live on Shopify's CDN once `shopify app deploy` runs;
  // for local dev we fall back to a same-origin path. Either way the iframe
  // gets the JS via `<script src>`. We inline the script tag pointed at the
  // Shopify-hosted asset URL once deployed; for now use the asset_url
  // pattern via a simple env var.
  const env = ctx.cloudflare.env as unknown as {
    WIDGET_JS_URL?: string;
    WIDGET_CSS_URL?: string;
  };
  const widgetJsUrl = env.WIDGET_JS_URL ?? "/widget.js";
  const widgetCssUrl = env.WIDGET_CSS_URL ?? "/widget.css";

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Preview</title>
<link rel="stylesheet" href="${widgetCssUrl}">
<style>
  body { margin:0; padding:16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#fff; }
  .pumper-preview-context { padding: 12px; background:#f6f6f7; border-radius:8px; margin-bottom:16px; font-size:13px; color:#666; }
  .pumper-preview-context strong { color:#111; }
</style>
</head><body>
<div class="pumper-preview-context">
  <strong>Preview</strong> — this is how the widget will appear on a product page.
</div>
<div class="pumper-mount" data-pumper-type="${type}" data-product-id="0" data-shop="preview"></div>
<script>
  window._pumperPreview = true;
  window._pumperPreviewConfig = { shop: "preview", settings: {
    primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
    borderRadius: 8, fontFamily: "inherit",
    bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
    showCompareAtPrice: true, currency: "USD", locale: "en"
  }, bundles: [], quantityBreaks: [] };
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "pumper:preview" && e.data.config) {
      window._pumperPreviewConfig = e.data.config;
      var firstBundleProductId = (e.data.config.bundles && e.data.config.bundles[0] && e.data.config.bundles[0].products && e.data.config.bundles[0].products[0] && e.data.config.bundles[0].products[0].productId)
        || (e.data.config.bundles && e.data.config.bundles[0] && e.data.config.bundles[0].collectionProducts && e.data.config.bundles[0].collectionProducts[0] && e.data.config.bundles[0].collectionProducts[0].productId)
        || (e.data.config.quantityBreaks && e.data.config.quantityBreaks[0] && e.data.config.quantityBreaks[0].productId)
        || "gid://shopify/Product/0";
      var bareId = String(firstBundleProductId).replace(/^gid:\\/\\/shopify\\/Product\\//, '');
      var mounts = document.querySelectorAll('.pumper-mount');
      mounts.forEach(function (m) {
        m.dataset.productId = bareId;
        m.removeAttribute('data-pumper-rendered');
      });
      if (window._pumperRerender) window._pumperRerender();
    }
  });
</script>
<script src="${widgetJsUrl}" defer></script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
