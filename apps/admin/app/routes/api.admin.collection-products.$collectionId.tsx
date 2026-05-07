import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { fetchCollectionTopProducts } from "~/lib/shopify-product-fetch";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { admin } = await authenticate.admin(request, ctx);

  const collectionId = decodeURIComponent(params.collectionId ?? "");
  if (!collectionId) {
    return json({ products: [] });
  }

  const products = await fetchCollectionTopProducts(admin, collectionId, 6);
  return json({ products });
}
