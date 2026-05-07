import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";
import {
  fetchProductDetails,
  fetchCollectionTopProducts,
  type ProductDetail,
} from "./shopify-product-fetch";

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export async function buildStorefrontConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  admin: AdminGraphqlClient,
  shopId: string,
) {
  const [bundlesAll, qbsAll, settingsRow, shopRow] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
    db
      .select()
      .from(schema.shopSettings)
      .where(eq(schema.shopSettings.shopId, shopId))
      .limit(1)
      .then((r: { shopId: string; primaryColor: string; textColor: string; backgroundColor: string; borderRadius: number; fontFamily: string; bundleHeadline: string; qbHeadline: string; showCompareAtPrice: boolean }[]) => r[0] ?? null),
    db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.id, shopId))
      .limit(1)
      .then((r: { currency: string; primaryLocale: string }[]) => r[0] ?? null),
  ]);

  const bundles = bundlesAll.filter((b) => b.status === "active");
  const qbs = qbsAll.filter((q) => q.status === "active");

  // Collect all product IDs that need details
  const allProductIds = new Set<string>();
  for (const b of bundles) {
    if (b.mode !== "mix_match") {
      for (const p of b.products) allProductIds.add(p.productId);
    }
  }
  for (const q of qbs) allProductIds.add(q.productId);

  const productMap = await fetchProductDetails(admin, [...allProductIds]);

  // Collect all gift / BOGO target variant ids referenced by any QB tier
  const tierVariantIds = new Set<string>();
  for (const q of qbs) {
    for (const tr of q.tiers) {
      if (tr.freeGiftVariantId) tierVariantIds.add(tr.freeGiftVariantId);
      if (tr.bogo?.targetVariantId) tierVariantIds.add(tr.bogo.targetVariantId);
    }
  }

  const variantAvailability: Record<string, boolean> = {};
  if (tierVariantIds.size > 0) {
    const res = await admin.graphql(
      `query VariantsAvailable($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            __typename
            id
            availableForSale
          }
        }
      }`,
      { variables: { ids: [...tierVariantIds] } },
    );
    const data = (await res.json()) as {
      data: { nodes: Array<{ __typename: string; id: string; availableForSale: boolean } | null> };
    };
    for (const node of data.data.nodes) {
      if (node && node.__typename === "ProductVariant") {
        variantAvailability[node.id] = node.availableForSale;
      }
    }
  }

  // Fetch collection products for mix_match bundles
  const collectionMap: Record<string, Awaited<ReturnType<typeof fetchCollectionTopProducts>>> = {};
  for (const b of bundles) {
    if (b.mode === "mix_match" && b.collectionId && !collectionMap[b.collectionId]) {
      collectionMap[b.collectionId] = await fetchCollectionTopProducts(admin, b.collectionId, 12);
    }
  }

  const enrichBundleProduct = (p: { productId: string; variantId: string | null; qty: number }) => {
    const detail = productMap[p.productId];
    const variant =
      detail?.variants.find((v) => (p.variantId ? v.variantId === p.variantId : true)) ??
      detail?.variants[0];
    return {
      productId: p.productId,
      variantId: variant?.variantId ?? p.variantId,
      qty: p.qty,
      title: detail?.title ?? "",
      image: detail?.image ?? null,
      available: variant?.available ?? false,
      priceCents: variant?.priceCents ?? 0,
    };
  };

  const buildQb = (q: (typeof qbs)[number]) => {
    const detail: ProductDetail | undefined = productMap[q.productId];
    const variants = (detail?.variants ?? []).map((v) => ({
      variantId: v.variantId,
      title: v.title,
      available: v.available,
      priceCents: v.priceCents,
    }));
    const tiers = q.tiers.map((tr) => ({
      qty: tr.qty,
      discountType: tr.discountType,
      discountValue: tr.discountValue,
      label: tr.label,
      isMostPopular: tr.isMostPopular,
      available: variants.some((v) => v.available),
      freeGiftVariantId: tr.freeGiftVariantId ?? null,
      freeGiftAvailable: tr.freeGiftVariantId
        ? (variantAvailability[tr.freeGiftVariantId] ?? false)
        : null,
      bogo: tr.bogo
        ? {
            mode: tr.bogo.mode,
            targetVariantId: tr.bogo.targetVariantId ?? null,
            bonusQty: tr.bogo.bonusQty,
            targetAvailable: tr.bogo.targetVariantId
              ? (variantAvailability[tr.bogo.targetVariantId] ?? false)
              : null,
          }
        : null,
    }));
    return {
      id: q.id,
      name: q.name,
      productId: q.productId,
      productTitle: detail?.title ?? "",
      productImage: detail?.image ?? null,
      productVariants: variants,
      tiers,
      combinable: q.combinable,
      styleOverrides: q.styleOverrides,
    };
  };

  return {
    shop: shopId,
    settings: {
      primaryColor: settingsRow?.primaryColor ?? "#7B1E2A",
      textColor: settingsRow?.textColor ?? "#1A1A1A",
      backgroundColor: settingsRow?.backgroundColor ?? "#FFFFFF",
      borderRadius: settingsRow?.borderRadius ?? 8,
      fontFamily: settingsRow?.fontFamily ?? "inherit",
      bundleHeadline: settingsRow?.bundleHeadline ?? "Frequently bought together",
      qbHeadline: settingsRow?.qbHeadline ?? "Choose your savings",
      showCompareAtPrice: settingsRow?.showCompareAtPrice ?? true,
      currency: shopRow?.currency ?? "USD",
      locale: shopRow?.primaryLocale ?? "en",
    },
    bundles: bundles.map((b) => ({
      id: b.id,
      name: b.name,
      mode: b.mode,
      products: b.mode === "mix_match" ? [] : b.products.map(enrichBundleProduct),
      collectionId: b.collectionId,
      targetQty: b.targetQty,
      collectionProducts:
        b.mode === "mix_match" && b.collectionId
          ? (collectionMap[b.collectionId] ?? [])
          : null,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      headline: b.headline,
      ctaLabel: b.ctaLabel,
      styleOverrides: b.styleOverrides,
    })),
    quantityBreaks: qbs.map(buildQb),
  };
}
