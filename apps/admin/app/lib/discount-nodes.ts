import { eq } from "drizzle-orm";
import { schema } from "~/db.server";

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

const FUNCTION_TITLE = "discount-function"; // matches shopify.extension.toml handle

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDiscountNodes(
  admin: AdminGraphqlClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  shopId: string,
): Promise<{ combinable: string; nonCombinable: string; shipping: string | null }> {
  const row = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).limit(1)
  )[0];

  let combinableId = row?.shopifyDiscountIdCombinable ?? null;
  let nonCombinableId = row?.shopifyDiscountIdNonCombinable ?? null;
  let shippingId = row?.shopifyShippingDiscountId ?? null;

  const fns = !combinableId || !nonCombinableId || !shippingId
    ? await fetchAppFunctions(admin)
    : null;

  if (!combinableId || !nonCombinableId) {
    const productFn = fns?.find((n) => n.apiType === "product_discounts" || n.apiType === "discount");
    if (!productFn) {
      const available = (fns ?? []).map((n) => `${n.title} (${n.apiType})`).join(", ");
      throw new Error(
        `Discount Function not found. Available functions: [${available}]. Run \`shopify app deploy\` first.`,
      );
    }
    if (!combinableId) {
      combinableId = await createDiscountNode(admin, productFn.id, "combinable", true);
    }
    if (!nonCombinableId) {
      nonCombinableId = await createDiscountNode(admin, productFn.id, "non_combinable", false);
    }
  }

  if (!shippingId) {
    const shippingFn = fns?.find((n) => n.apiType === "shipping_discounts");
    if (shippingFn) {
      try {
        shippingId = await createShippingDiscountNode(admin, shippingFn.id);
      } catch (err) {
        console.error("[ensureDiscountNodes] shipping discount registration failed (non-fatal):", err);
      }
    }
  }

  await db
    .update(schema.shops)
    .set({
      shopifyDiscountIdCombinable: combinableId,
      shopifyDiscountIdNonCombinable: nonCombinableId,
      shopifyShippingDiscountId: shippingId,
    })
    .where(eq(schema.shops.id, shopId));

  return { combinable: combinableId!, nonCombinable: nonCombinableId!, shipping: shippingId };
}

async function fetchAppFunctions(admin: AdminGraphqlClient): Promise<{ id: string; apiType: string; title: string }[]> {
  const res = await admin.graphql(
    `query { shopifyFunctions(first: 25) { nodes { id apiType title } } }`,
  );
  const data = (await res.json()) as {
    data: { shopifyFunctions: { nodes: { id: string; apiType: string; title: string }[] } };
  };
  return data.data.shopifyFunctions.nodes;
}

async function createShippingDiscountNode(
  admin: AdminGraphqlClient,
  functionId: string,
): Promise<string> {
  const res = await admin.graphql(
    `mutation Create($d: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $d) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        d: {
          title: "Bundler — free shipping",
          functionId,
          startsAt: new Date().toISOString(),
          combinesWith: {
            productDiscounts: true,
            orderDiscounts: true,
            shippingDiscounts: true,
          },
        },
      },
    },
  );
  const data = (await res.json()) as {
    data: {
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    };
  };
  const result = data.data.discountAutomaticAppCreate;
  if (result.userErrors.length > 0) {
    throw new Error(`shipping discountAutomaticAppCreate failed: ${JSON.stringify(result.userErrors)}`);
  }
  if (!result.automaticAppDiscount) {
    throw new Error("shipping discountAutomaticAppCreate returned null discount");
  }
  return result.automaticAppDiscount.discountId;
}

async function createDiscountNode(
  admin: AdminGraphqlClient,
  functionId: string,
  kind: "combinable" | "non_combinable",
  combines: boolean,
): Promise<string> {
  const res = await admin.graphql(
    `mutation Create($d: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $d) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        d: {
          title: kind === "combinable" ? "Bundler (combinable)" : "Bundler (non-combinable)",
          functionId,
          startsAt: new Date().toISOString(),
          combinesWith: {
            productDiscounts: combines,
            orderDiscounts: combines,
            shippingDiscounts: combines,
          },
          metafields: [
            {
              namespace: "$app:discount-function",
              key: "function-configuration",
              type: "json",
              value: JSON.stringify({ nodeKind: kind }),
            },
          ],
        },
      },
    },
  );
  const data = (await res.json()) as {
    data: {
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    };
  };
  const result = data.data.discountAutomaticAppCreate;
  if (result.userErrors.length > 0) {
    throw new Error(`discountAutomaticAppCreate failed: ${JSON.stringify(result.userErrors)}`);
  }
  if (!result.automaticAppDiscount) {
    throw new Error("discountAutomaticAppCreate returned null discount");
  }
  return result.automaticAppDiscount.discountId;
}
