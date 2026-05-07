import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";

const MAX_BYTES = 50_000;

type AdminGraphqlClient = {
  graphql(
    query: string,
    options?: { variables?: unknown },
  ): Promise<Response>;
};

interface SyncConfig {
  schemaVersion: number;
  bundles: Array<{
    id: string;
    name: string;
    status: string;
    mode: "classic" | "mix_match";
    products: Array<{
      productId: string;
      variantId: string | null;
      qty: number;
    }>;
    collectionId: string | null;
    targetQty: number | null;
    discountType: string;
    discountValue: number;
    combinable: boolean;
    triggerProductIds: string[];
    headline: string | null;
    ctaLabel: string | null;
  }>;
  quantityBreaks: Array<{
    id: string;
    name: string;
    status: string;
    productId: string;
    tiers: Array<{
      qty: number;
      discountType: string;
      discountValue: number;
      label: string;
      isMostPopular: boolean;
      freeGiftVariantId?: string | null;
      bogo?: {
        mode: string;
        targetVariantId?: string | null;
        bonusQty: number;
      } | null;
    }>;
    combinable: boolean;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncShopConfig(
  db: any,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<void> {
  const [bundles, qbs] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
  ]);

  const config: SyncConfig = {
    schemaVersion: 1,
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      mode: b.mode,
      products: b.products,
      collectionId: b.collectionId ?? null,
      targetQty: b.targetQty ?? null,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      headline: b.headline,
      ctaLabel: b.ctaLabel,
    })),
    quantityBreaks: qbs.map((q) => ({
      id: q.id,
      name: q.name,
      status: q.status,
      productId: q.productId,
      tiers: q.tiers.map((tr) => ({
        qty: tr.qty,
        discountType: tr.discountType,
        discountValue: tr.discountValue,
        label: tr.label,
        isMostPopular: tr.isMostPopular,
        freeGiftVariantId: tr.freeGiftVariantId ?? null,
        bogo: tr.bogo ?? null,
      })),
      combinable: q.combinable,
    })),
  };

  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Config JSON is ${bytes} bytes; exceeds ${MAX_BYTES}-byte safety limit. ` +
        `Sharding not yet implemented (Phase 3 Group B). Reduce bundles or QBs and try again.`,
    );
  }

  const shopGid = await getOrFetchShopGid(db, admin, shopId);

  await admin.graphql(
    `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "pumper",
            key: "config",
            type: "json",
            value: json,
          },
        ],
      },
    },
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrFetchShopGid(
  db: any,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<string> {
  const rows = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1);
  const cached = rows[0]?.shopifyShopGid;
  if (cached) return cached;

  const res = await admin.graphql(`query { shop { id } }`);
  const data = (await res.json()) as { data: { shop: { id: string } } };
  const gid = data.data.shop.id;

  await db
    .update(schema.shops)
    .set({ shopifyShopGid: gid })
    .where(eq(schema.shops.id, shopId));

  return gid;
}
