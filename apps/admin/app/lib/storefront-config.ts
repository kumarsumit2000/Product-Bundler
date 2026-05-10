import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";
import * as newsletterRepo from "./newsletter/repo";
import * as pgRepo from "./progressive-gifts/repo";
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
  const [bundlesAll, qbsAll, settingsRow, shopRow, newsletter, pgsAll] = await Promise.all([
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
    newsletterRepo.getOrDefault(db, shopId),
    pgRepo.listByShop(db, shopId),
  ]);

  const progressiveGifts = pgsAll.filter((p) => p.status === "active");

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
  for (const pg of progressiveGifts) {
    for (const t of pg.thresholds) {
      if (t.giftProductId) allProductIds.add(t.giftProductId);
    }
  }

  const productMap = await fetchProductDetails(admin, [...allProductIds]);

  // Collect all gift / BOGO target variant ids referenced by any QB tier
  // OR by a bundle's free-gift attachment.
  const tierVariantIds = new Set<string>();
  for (const q of qbs) {
    for (const tr of q.tiers) {
      if (tr.freeGiftVariantId) tierVariantIds.add(tr.freeGiftVariantId);
      if (tr.bogo?.targetVariantId) tierVariantIds.add(tr.bogo.targetVariantId);
    }
  }
  for (const b of bundles) {
    if (b.freeGiftVariantId) tierVariantIds.add(b.freeGiftVariantId);
  }

  const variantAvailability: Record<string, boolean> = {};
  const variantTitles: Record<string, string> = {};
  if (tierVariantIds.size > 0) {
    const res = await admin.graphql(
      `query VariantsAvailable($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on ProductVariant {
            __typename
            id
            title
            availableForSale
          }
        }
      }`,
      { variables: { ids: [...tierVariantIds] } },
    );
    const data = (await res.json()) as {
      data: { nodes: Array<{ __typename: string; id: string; title: string; availableForSale: boolean } | null> };
    };
    for (const node of data.data.nodes) {
      if (node && node.__typename === "ProductVariant") {
        variantAvailability[node.id] = node.availableForSale;
        variantTitles[node.id] = node.title;
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
      extraProducts: (tr.extraProducts ?? []).map((p) => ({
        productId: p.productId,
        variantId: p.variantId ?? null,
        qty: p.qty,
        title: p.title,
        image: p.image,
      })),
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
      textOverrides: q.textOverrides,
      headline: q.headline,
      ctaLabel: q.ctaLabel,
      subscription: q.subscription ?? null,
      visibility: q.visibility ?? "specific",
      visibilityProductIds: q.visibilityProductIds ?? [],
      visibilityCollectionIds: q.visibilityCollectionIds ?? [],
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
      textOverrides: b.textOverrides,
      freeGiftVariantId: b.freeGiftVariantId ?? null,
      freeGiftVariantTitle: b.freeGiftVariantId ? (variantTitles[b.freeGiftVariantId] ?? null) : null,
      freeGiftAvailable: b.freeGiftVariantId ? (variantAvailability[b.freeGiftVariantId] ?? false) : null,
      subscription: b.subscription ?? null,
    })),
    quantityBreaks: qbs.map(buildQb),
    progressiveGifts: progressiveGifts.map((pg) => ({
      id: pg.id,
      name: pg.name,
      headline: pg.headline,
      subtitle: pg.subtitle,
      layout: pg.layout,
      hideLocked: pg.hideLocked,
      showLockedLabels: pg.showLockedLabels,
      styleOverrides: pg.styleOverrides ?? null,
      thresholds: pg.thresholds.map((tr) => {
        const isShipping = tr.kind === "free_shipping";
        const detail = !isShipping && tr.giftProductId ? productMap[tr.giftProductId] : undefined;
        return {
          minSpendCents: tr.minSpendCents,
          kind: (tr.kind ?? "free_gift") as "free_gift" | "free_shipping",
          label: tr.label,
          title: tr.title ?? null,
          lockedTitle: tr.lockedTitle ?? null,
          labelCrossedOut: tr.labelCrossedOut ?? null,
          lockedLabel: tr.lockedLabel ?? null,
          iconUrl: tr.iconUrl ?? null,
          giftProductId: tr.giftProductId ?? null,
          giftVariantId: tr.giftVariantId || null,
          productTitle: detail?.title ?? null,
          productImage: detail?.image ?? null,
          variants: (detail?.variants ?? []).map((v) => ({
            variantId: v.variantId,
            title: v.title,
            available: v.available,
            priceCents: v.priceCents,
          })),
        };
      }),
    })),
    newsletter: newsletter.enabled
      ? {
          headline: newsletter.headline,
          subtitle: newsletter.subtitle,
          placeholder: newsletter.placeholder,
          ctaLabel: newsletter.ctaLabel,
          successMessage: newsletter.successMessage,
          tags: newsletter.tags,
          styleOverrides: newsletter.styleOverrides ?? null,
          popup: newsletter.popupEnabled
            ? {
                trigger: newsletter.popupTrigger as "delay" | "exit_intent" | "scroll",
                delaySeconds: newsletter.popupDelaySeconds,
                scrollPercent: newsletter.popupScrollPercent,
                frequencyDays: newsletter.popupFrequencyDays,
                imageUrl: newsletter.popupImageUrl || null,
                imagePosition: newsletter.popupImagePosition as "none" | "top" | "bottom" | "left" | "right",
                excludedPaths: newsletter.excludedPaths
                  .split(/[\n,]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : null,
        }
      : null,
  };
}
