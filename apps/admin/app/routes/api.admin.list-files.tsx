import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

// Admin-only: list the merchant's MediaImage files from Shopify Files so
// the image picker can render a grid and let them re-use an image they've
// already uploaded (avoids re-uploading the same logo / promo banner).
//
// Optional `q` query param filters by filename. Returns the 50 most
// recent matches; the grid in ShopifyImageField is meant for quick reuse,
// not exhaustive browsing.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { admin } = await authenticate.admin(request, ctx);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  // Build the Shopify Files search-syntax string. `media_type:IMAGE` keeps
  // documents/videos out; a free-text filter searches filename + alt text.
  const queryString = q
    ? `media_type:IMAGE AND (filename:*${escapeQuery(q)}* OR alt:*${escapeQuery(q)}*)`
    : "media_type:IMAGE";

  const res = await admin.graphql(
    `#graphql
    query Files($query: String!) {
      files(first: 50, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            alt
            createdAt
            ... on MediaImage {
              image { url width height }
            }
          }
        }
      }
    }`,
    { variables: { query: queryString } },
  );
  const j = (await res.json()) as {
    data?: {
      files?: {
        edges?: Array<{
          node?: {
            id?: string;
            alt?: string | null;
            createdAt?: string;
            image?: { url?: string; width?: number; height?: number };
          };
        }>;
      };
    };
  };
  const images = (j.data?.files?.edges ?? [])
    .map((e) => e.node)
    .filter((n): n is NonNullable<typeof n> => !!n)
    .filter((n) => !!n.image?.url)
    .map((n) => ({
      id: n.id!,
      url: n.image!.url!,
      alt: n.alt ?? "",
      width: n.image?.width ?? null,
      height: n.image?.height ?? null,
      createdAt: n.createdAt ?? "",
    }));

  return json({ images });
}

// Escape Shopify search-syntax meta chars in a user-supplied filter.
function escapeQuery(s: string): string {
  return s.replace(/[\\:()*"]/g, "");
}
