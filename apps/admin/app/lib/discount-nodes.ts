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
): Promise<{ combinable: string; nonCombinable: string }> {
  const row = (
    await db.select().from(schema.shops).where(eq(schema.shops.id, shopId)).limit(1)
  )[0];

  let combinableId = row?.shopifyDiscountIdCombinable ?? null;
  let nonCombinableId = row?.shopifyDiscountIdNonCombinable ?? null;

  if (combinableId && nonCombinableId) {
    return { combinable: combinableId, nonCombinable: nonCombinableId };
  }

  const functionId = await getOrFetchFunctionId(admin);

  if (!combinableId) {
    combinableId = await createDiscountNode(admin, functionId, "combinable", true);
  }
  if (!nonCombinableId) {
    nonCombinableId = await createDiscountNode(admin, functionId, "non_combinable", false);
  }

  await db
    .update(schema.shops)
    .set({
      shopifyDiscountIdCombinable: combinableId,
      shopifyDiscountIdNonCombinable: nonCombinableId,
    })
    .where(eq(schema.shops.id, shopId));

  return { combinable: combinableId, nonCombinable: nonCombinableId };
}

async function getOrFetchFunctionId(admin: AdminGraphqlClient): Promise<string> {
  const res = await admin.graphql(
    `query { shopifyFunctions(first: 25, apiType: "discount") { nodes { id title } } }`,
  );
  const data = (await res.json()) as {
    data: { shopifyFunctions: { nodes: { id: string; title: string }[] } };
  };
  const fn = data.data.shopifyFunctions.nodes.find((n) => n.title === FUNCTION_TITLE);
  if (!fn) {
    throw new Error(
      `Shopify Function "${FUNCTION_TITLE}" not found. Run \`shopify app deploy\` first.`,
    );
  }
  return fn.id;
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
