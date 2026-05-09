import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { authenticate, type AppLoadContext } from "~/shopify.server";

type GqlFilesResponse = {
  data?: {
    files: {
      edges: Array<{
        node: {
          id: string;
          alt: string | null;
          createdAt: string;
          image?: { url: string; width: number | null; height: number | null } | null;
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { admin } = await authenticate.admin(request, ctx);
  const url = new URL(request.url);
  const search = (url.searchParams.get("q") ?? "").trim();

  // Shopify Files query — restrict to images only.
  const queryString = search
    ? `media_type:IMAGE AND filename:*${search}*`
    : "media_type:IMAGE";

  const res = await admin.graphql(
    `query Files($first: Int!, $query: String) {
      files(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
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
    { variables: { first: 50, query: queryString } },
  );

  const data = (await res.json()) as GqlFilesResponse;
  if (data.errors?.length) {
    console.error("[api.files] GraphQL errors:", data.errors);
    return json({ files: [] }, { status: 200 });
  }

  const files = (data.data?.files.edges ?? [])
    .map((e) => e.node)
    .filter((n) => n.image && n.image.url)
    .map((n) => ({
      id: n.id,
      url: n.image!.url,
      alt: n.alt ?? "",
      width: n.image!.width,
      height: n.image!.height,
    }));

  return json({ files });
}
