import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";
import * as bxgyRepo from "./bxgy-offers/repo";
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
  const [bundlesAll, qbsAll, bxgyAll, settingsRow, shopRow, pgsAll] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
    bxgyRepo.listByShop(db, shopId),
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
    pgRepo.listByShop(db, shopId),
  ]);

  const progressiveGifts = pgsAll.filter((p) => p.status === "active");

  // Pre-sort by sortOrder ASC so the widget's match.ts always picks the
  // merchant's chosen priority when multiple rules target the same PDP.
  // Ties fall back to createdAt ASC (older rows win) — deterministic.
  const bySort = <T extends { sortOrder?: number; createdAt: Date }>(a: T, b: T): number =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();
  // Scheduling: only surface widgets currently inside their active window.
  // Status=active is necessary but not sufficient — a scheduled-for-Black-Friday
  // bundle is "active" all year but only renders during its window.
  const now = Date.now();
  const inWindow = (a: { activeStartAt?: Date | null; activeEndAt?: Date | null }): boolean => {
    if (a.activeStartAt && now < a.activeStartAt.getTime()) return false;
    if (a.activeEndAt && now > a.activeEndAt.getTime()) return false;
    return true;
  };
  const bundles = bundlesAll.filter((b) => b.status === "active" && inWindow(b)).sort(bySort);
  const qbs = qbsAll.filter((q) => q.status === "active" && inWindow(q)).sort(bySort);
  const bxgyOffers = bxgyAll.filter((o) => o.status === "active" && inWindow(o)).sort(bySort);
  // cart-upsells removed in Pumper-parity strip-down — preserve the
  // empty array shape so any downstream consumers don't crash.
  const cartUpsells: Array<never> = [];

  // Collect all product IDs that need details
  const allProductIds = new Set<string>();
  // Shopify's GraphQL `nodes(ids: [ID!]!)` rejects empty/invalid global IDs
  // with a 500. Merchants can save a QB/BXGY without picking a product (e.g.
  // visibility=all on QB), so we have to defensively skip falsy ids here.
  const addId = (id: string | null | undefined) => {
    if (id && id.startsWith("gid://")) allProductIds.add(id);
  };
  for (const b of bundles) {
    if (b.mode !== "mix_match") {
      for (const p of b.products) addId(p.productId);
    }
  }
  for (const q of qbs) addId(q.productId);
  for (const o of bxgyOffers) {
    addId(o.productId);
    addId(o.freeGiftProductId);
  }
  for (const pg of progressiveGifts) {
    for (const t of pg.thresholds) addId(t.giftProductId);
  }
  for (const b of bundles) addId(b.freeGiftProductId);
  for (const q of qbs) addId(q.freeGiftProductId);
  void cartUpsells; // intentionally unused after Pumper-parity strip-down

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
  for (const q of qbs) {
    if (q.freeGiftVariantId) tierVariantIds.add(q.freeGiftVariantId);
  }
  for (const o of bxgyOffers) {
    if (o.freeGiftVariantId) tierVariantIds.add(o.freeGiftVariantId);
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
      enabled: tr.enabled,
      image: tr.image ?? null,
      freeShipping: tr.freeShipping ?? false,
      available: variants.some((v) => v.available),
      freeGiftVariantId: tr.freeGiftVariantId ?? null,
      freeGiftVariantTitle: tr.freeGiftVariantId
        ? (variantTitles[tr.freeGiftVariantId] ?? null)
        : null,
      freeGiftAvailable: tr.freeGiftVariantId
        ? (variantAvailability[tr.freeGiftVariantId] ?? false)
        : null,
      bogo: tr.bogo
        ? {
            mode: tr.bogo.mode,
            targetVariantId: tr.bogo.targetVariantId ?? null,
            targetVariantTitle: tr.bogo.targetVariantId
              ? (variantTitles[tr.bogo.targetVariantId] ?? null)
              : null,
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
      linkedProgressiveGiftId: q.linkedProgressiveGiftId ?? null,
      stickyAtc: q.stickyAtc ?? null,
      addonsOrder: q.addonsOrder ?? null,
      checkboxUpsellsEnabled: q.checkboxUpsellsEnabled ?? false,
      checkboxUpsells: q.checkboxUpsells ?? [],
      bindToCurrentProduct: q.bindToCurrentProduct ?? false,
      freeGiftVariantId: q.freeGiftVariantId ?? null,
      freeGiftVariantTitle: q.freeGiftVariantId ? (variantTitles[q.freeGiftVariantId] ?? null) : null,
      freeGiftAvailable: q.freeGiftVariantId ? (variantAvailability[q.freeGiftVariantId] ?? false) : null,
      freeGiftMinQty: q.freeGiftMinQty ?? 1,
      freeGiftProductId: q.freeGiftProductId ?? null,
      freeGiftProductTitle: q.freeGiftProductId ? (productMap[q.freeGiftProductId]?.title ?? null) : null,
      freeGiftProductImage: q.freeGiftProductId ? (productMap[q.freeGiftProductId]?.image ?? null) : null,
      freeGiftProductVariants: q.freeGiftProductId
        ? (productMap[q.freeGiftProductId]?.variants ?? []).map((v) => ({
            variantId: v.variantId,
            title: v.title,
            available: v.available,
            priceCents: v.priceCents,
          }))
        : null,
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
      bindToCurrentCollection: b.bindToCurrentCollection ?? false,
      targetQty: b.targetQty,
      collectionProducts:
        b.mode === "mix_match" && b.collectionId
          ? (collectionMap[b.collectionId] ?? [])
          : null,
      discountType: b.discountType,
      discountValue: b.discountValue,
      combinable: b.combinable,
      triggerProductIds: b.triggerProductIds,
      visibility: b.visibility ?? "same_as_members",
      visibilityCollectionIds: b.visibilityCollectionIds ?? [],
      headline: b.headline,
      ctaLabel: b.ctaLabel,
      styleOverrides: b.styleOverrides,
      textOverrides: b.textOverrides,
      freeGiftVariantId: b.freeGiftVariantId ?? null,
      freeGiftVariantTitle: b.freeGiftVariantId ? (variantTitles[b.freeGiftVariantId] ?? null) : null,
      freeGiftAvailable: b.freeGiftVariantId ? (variantAvailability[b.freeGiftVariantId] ?? false) : null,
      freeGiftProductId: b.freeGiftProductId ?? null,
      freeGiftProductTitle: b.freeGiftProductId ? (productMap[b.freeGiftProductId]?.title ?? null) : null,
      freeGiftProductImage: b.freeGiftProductId ? (productMap[b.freeGiftProductId]?.image ?? null) : null,
      freeGiftProductVariants: b.freeGiftProductId
        ? (productMap[b.freeGiftProductId]?.variants ?? []).map((v) => ({
            variantId: v.variantId,
            title: v.title,
            available: v.available,
            priceCents: v.priceCents,
          }))
        : null,
      linkedProgressiveGiftId: b.linkedProgressiveGiftId ?? null,
      stickyAtc: b.stickyAtc ?? null,
      addonsOrder: b.addonsOrder ?? null,
      subscription: b.subscription ?? null,
    })),
    quantityBreaks: qbs.map(buildQb),
    bxgyOffers: bxgyOffers.map((o) => {
      const detail = productMap[o.productId];
      const variants = (detail?.variants ?? []).map((v) => ({
        variantId: v.variantId,
        title: v.title,
        available: v.available,
        priceCents: v.priceCents,
      }));
      return {
        id: o.id,
        name: o.name,
        productId: o.productId,
        productTitle: detail?.title ?? "",
        productImage: detail?.image ?? null,
        productVariants: variants,
        bars: o.bars,
        combinable: o.combinable,
        headline: o.headline,
        ctaLabel: o.ctaLabel,
        styleOverrides: o.styleOverrides,
        textOverrides: o.textOverrides,
        visibility: o.visibility as "all" | "all_except" | "specific" | "collections",
        visibilityProductIds: o.visibilityProductIds,
        visibilityCollectionIds: o.visibilityCollectionIds,
        linkedProgressiveGiftId: o.linkedProgressiveGiftId ?? null,
        addonsOrder: o.addonsOrder ?? null,
        stickyAtc: o.stickyAtc ?? null,
        freeGiftVariantId: o.freeGiftVariantId ?? null,
        freeGiftVariantTitle: o.freeGiftVariantId ? (variantTitles[o.freeGiftVariantId] ?? null) : null,
        freeGiftAvailable: o.freeGiftVariantId ? (variantAvailability[o.freeGiftVariantId] ?? false) : null,
        freeGiftMinBuyQty: o.freeGiftMinBuyQty ?? 1,
        freeGiftProductId: o.freeGiftProductId ?? null,
        freeGiftProductTitle: o.freeGiftProductId ? (productMap[o.freeGiftProductId]?.title ?? null) : null,
        freeGiftProductImage: o.freeGiftProductId ? (productMap[o.freeGiftProductId]?.image ?? null) : null,
        freeGiftProductVariants: o.freeGiftProductId
          ? (productMap[o.freeGiftProductId]?.variants ?? []).map((v) => ({
              variantId: v.variantId,
              title: v.title,
              available: v.available,
              priceCents: v.priceCents,
            }))
          : null,
        checkboxUpsellsEnabled: o.checkboxUpsellsEnabled ?? false,
        checkboxUpsells: o.checkboxUpsells ?? [],
        bindToCurrentProduct: o.bindToCurrentProduct ?? false,
        subscription: o.subscription ?? null,
      };
    }),
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
    // The newsletter / signup-form / cart-upsell / countdown / post-
    // purchase surfaces were removed in the Pumper-parity strip-down.
    // Empty payloads are kept on the response for one release so any
    // older widget still hosted on a merchant theme degrades to "no
    // surfaces present" instead of crashing on undefined access.
    countdowns: [],
    newsletter: null,
    newsletterCampaigns: [],
    signupForms: [],
    cartUpsells: [],
  };
}
