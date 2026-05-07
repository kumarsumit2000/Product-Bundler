type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export type ProductVariantDetail = {
  variantId: string;
  title: string;
  available: boolean;
  priceCents: number;
};

export type ProductDetail = {
  id: string;
  title: string;
  image: string | null;
  variants: ProductVariantDetail[];
};

export type CollectionProduct = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  available: boolean;
  priceCents: number;
};

function dollarsStrToCents(s: string): number {
  const parsed = parseFloat(s);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export async function fetchProductDetails(
  admin: AdminGraphqlClient,
  productIds: string[],
): Promise<Record<string, ProductDetail>> {
  if (productIds.length === 0) return {};
  const res = await admin.graphql(
    `query Products($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          __typename
          id
          title
          featuredImage { url }
          variants(first: 50) {
            nodes { id title availableForSale price }
          }
        }
      }
    }`,
    { variables: { ids: productIds } },
  );
  const data = (await res.json()) as {
    data: {
      nodes: Array<
        | {
            __typename: "Product";
            id: string;
            title: string;
            featuredImage: { url: string } | null;
            variants: { nodes: Array<{ id: string; title: string; availableForSale: boolean; price: string }> };
          }
        | null
      >;
    };
  };
  const out: Record<string, ProductDetail> = {};
  for (const node of data.data.nodes) {
    if (!node || node.__typename !== "Product") continue;
    out[node.id] = {
      id: node.id,
      title: node.title,
      image: node.featuredImage?.url ?? null,
      variants: node.variants.nodes.map((v) => ({
        variantId: v.id,
        title: v.title,
        available: v.availableForSale,
        priceCents: dollarsStrToCents(v.price),
      })),
    };
  }
  return out;
}

export type VariantDetail = {
  variantId: string;
  variantTitle: string;
  productTitle: string;
  image: string | null;
};

export async function fetchVariantDetails(
  admin: AdminGraphqlClient,
  variantIds: string[],
): Promise<Record<string, VariantDetail>> {
  if (variantIds.length === 0) return {};
  const res = await admin.graphql(
    `query Variants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          __typename
          id
          title
          image { url }
          product { id title }
        }
      }
    }`,
    { variables: { ids: variantIds } },
  );
  const data = (await res.json()) as {
    data: {
      nodes: Array<
        | {
            __typename: "ProductVariant";
            id: string;
            title: string;
            image: { url: string } | null;
            product: { id: string; title: string };
          }
        | null
      >;
    };
  };
  const out: Record<string, VariantDetail> = {};
  for (const node of data.data.nodes) {
    if (!node || node.__typename !== "ProductVariant") continue;
    out[node.id] = {
      variantId: node.id,
      variantTitle: node.title,
      productTitle: node.product.title,
      image: node.image?.url ?? null,
    };
  }
  return out;
}

export async function fetchCollectionTopProducts(
  admin: AdminGraphqlClient,
  collectionId: string,
  limit: number,
): Promise<CollectionProduct[]> {
  // Default sort works for both manual and automated/smart collections.
  // sortKey: MANUAL is rejected for smart collections, so we omit it.
  const res = await admin.graphql(
    `query Collection($id: ID!, $first: Int!) {
      collection(id: $id) {
        products(first: $first) {
          nodes {
            id
            title
            featuredImage { url }
            variants(first: 1) {
              nodes { id availableForSale price }
            }
          }
        }
      }
    }`,
    { variables: { id: collectionId, first: limit } },
  );
  const data = (await res.json()) as {
    data?: {
      collection: {
        products: {
          nodes: Array<{
            id: string;
            title: string;
            featuredImage: { url: string } | null;
            variants: { nodes: Array<{ id: string; availableForSale: boolean; price: string }> };
          }>;
        };
      } | null;
    };
    errors?: Array<{ message: string }>;
  };
  if (data.errors && data.errors.length > 0) {
    return [];
  }
  const products = data.data?.collection?.products.nodes ?? [];
  return products.map((p) => {
    const v = p.variants.nodes[0];
    return {
      productId: p.id,
      variantId: v?.id ?? null,
      title: p.title,
      image: p.featuredImage?.url ?? null,
      available: v?.availableForSale ?? false,
      priceCents: v ? dollarsStrToCents(v.price) : 0,
    };
  });
}
