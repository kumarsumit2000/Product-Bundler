import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import * as countdownRepo from "~/lib/countdowns/repo";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { enrichProgressiveGiftsForPreview } from "~/lib/preview-pg-enrich";
import { validateBundle } from "~/lib/bundles/validate";
import { parseSubscriptionForm } from "~/lib/parse-subscription";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { STICKY_ATC_DEFAULTS } from "~/components/StickyAtcCard";
import { DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "~/components/WidgetAddonsCard";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import { PreviewPane } from "~/components/PreviewPane";
import { StickyAtcPreview } from "~/components/StickyAtcPreview";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { getUsage } from "~/lib/billing/usage";
import { useSavedToast } from "~/lib/toast";
import { buildPreviewBundleConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides, styleOverridesToFormFields } from "~/lib/preview-overrides";
import type { PickedProduct } from "~/components/ProductPicker";
import { fetchCollectionTopProducts, fetchVariantDetails, type CollectionProduct } from "~/lib/shopify-product-fetch";

type ProductDetails = { id: string; title: string; image: string | null };

async function fetchProductDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  productIds: string[],
): Promise<Record<string, ProductDetails>> {
  if (productIds.length === 0) return {};
  try {
    const res = await admin.graphql(
      `query Products($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            featuredImage { url }
          }
        }
      }`,
      { variables: { ids: productIds } },
    );
    const data = (await res.json()) as {
      data: {
        nodes: Array<{ id: string; title: string; featuredImage: { url: string } | null } | null>;
      };
    };
    const map: Record<string, ProductDetails> = {};
    for (const node of data.data.nodes) {
      if (node) {
        map[node.id] = {
          id: node.id,
          title: node.title,
          image: node.featuredImage?.url ?? null,
        };
      }
    }
    return map;
  } catch (err) {
    console.error("[app.bundles.$id] fetchProductDetails failed (non-fatal):", err);
    return {};
  }
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundle = await bundleRepo.getById(db, session.shop, params.id!);
  if (!bundle) throw new Response("Not found", { status: 404 });

  const productIds = [
    ...bundle.products.map((p) => p.productId),
    ...bundle.triggerProductIds,
    ...(bundle.freeGiftProductId ? [bundle.freeGiftProductId] : []),
  ];
  const productDetails = await fetchProductDetails(admin, [...new Set(productIds)]);

  let collectionDetails: { id: string; title: string; image: string | null } | null = null;
  let collectionTopProducts: CollectionProduct[] | null = null;
  if (bundle.mode === "mix_match" && bundle.collectionId) {
    try {
      const [cRes, topProducts] = await Promise.all([
        admin.graphql(
          `query Collection($id: ID!) { collection(id: $id) { id title image { url } } }`,
          { variables: { id: bundle.collectionId } },
        ),
        fetchCollectionTopProducts(admin, bundle.collectionId, 6).catch(() => [] as CollectionProduct[]),
      ]);
      const cData = (await cRes.json()) as {
        data?: { collection: { id: string; title: string; image: { url: string } | null } | null };
      };
      if (cData.data?.collection) {
        collectionDetails = {
          id: cData.data.collection.id,
          title: cData.data.collection.title,
          image: cData.data.collection.image?.url ?? null,
        };
      }
      collectionTopProducts = topProducts;
    } catch {
      // Don't crash the edit page on a Shopify Admin hiccup; preview will load via the client fetcher.
      collectionTopProducts = [];
    }
  }

  const giftVariantDetails = bundle.freeGiftVariantId
    ? await fetchVariantDetails(admin, [bundle.freeGiftVariantId]).catch((err) => {
        console.error("[app.bundles.$id] gift variant fetch failed (non-fatal):", err);
        return {} as Awaited<ReturnType<typeof fetchVariantDetails>>;
      })
    : {};

  const [usage, countdowns, pgs] = await Promise.all([
    getUsage(db, session.shop),
    countdownRepo.listByShop(db, session.shop),
    pgRepo.listByShop(db, session.shop),
  ]);
  return json({
    bundle, productDetails, collectionDetails, collectionTopProducts, giftVariantDetails,
    plan: usage.plan,
    countdownOptions: countdowns.map((c) => ({ id: c.id, name: c.name })),
    progressiveGiftOptions: pgs.map((p) => ({ id: p.id, name: p.name })),
    allCountdowns: countdowns
      .filter((c) => c.status === "active")
      .map((c) => ({
        id: c.id,
        name: c.name,
        endAt: new Date(c.endAt).getTime(),
        headline: c.headline,
        expiredHeadline: c.expiredHeadline,
        layout: c.layout as "inline" | "bar",
        styleOverrides: (c.styleOverrides ?? null) as Record<string, unknown> | null,
      })),
    allProgressiveGifts: await enrichProgressiveGiftsForPreview(admin, pgs),
  });
}

export async function action({
  request,
  params,
  context,
}: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const products: PickedProduct[] = JSON.parse(
    (form.get("products") as string) || "[]"
  );
  const triggerProducts: PickedProduct[] = JSON.parse(
    (form.get("triggerProducts") as string) || "[]"
  );
  const visibilityRaw = (form.get("visibility") as string) || "same_as_members";
  const visibility = (["same_as_members", "all", "all_except", "specific", "collections"].includes(visibilityRaw)
    ? visibilityRaw
    : "same_as_members") as "same_as_members" | "all" | "all_except" | "specific" | "collections";
  const triggerProductIds =
    visibility === "specific" || visibility === "all_except"
      ? triggerProducts.map((p) => p.productId)
      : [];
  const visibilityCollectionIds = (() => {
    try { return JSON.parse((form.get("visibilityCollectionIds") as string) || "[]") as string[]; }
    catch { return []; }
  })();

  const mode = ((form.get("mode") as string) || "classic") as "classic" | "mix_match";
  const collectionIdRaw = (form.get("collectionId") as string) || "";
  const collectionId = collectionIdRaw || null;
  const targetQtyRaw = form.get("targetQty") as string;
  const targetQty = targetQtyRaw ? parseInt(targetQtyRaw, 10) : null;

  const styleOverridesRaw = (form.get("styleOverrides") as string) || "{}";
  const textOverridesRaw = (form.get("textOverrides") as string) || "{}";
  let parsedStyleOverrides: Record<string, unknown> | null = null;
  let parsedTextOverrides: Record<string, string> | null = null;
  try {
    const so = JSON.parse(styleOverridesRaw);
    const filteredSo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(so)) {
      if (v !== undefined && v !== null && v !== "") filteredSo[k] = v;
    }
    parsedStyleOverrides = Object.keys(filteredSo).length > 0 ? filteredSo : null;
  } catch { parsedStyleOverrides = null; }
  try {
    const to = JSON.parse(textOverridesRaw);
    const filteredTo: Record<string, string> = {};
    for (const [k, v] of Object.entries(to)) {
      if (typeof v === "string" && v.length > 0) filteredTo[k] = v;
    }
    parsedTextOverrides = Object.keys(filteredTo).length > 0 ? filteredTo : null;
  } catch { parsedTextOverrides = null; }

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    mode,
    products: mode === "mix_match" ? [] : products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    collectionId: mode === "mix_match" ? collectionId : null,
    targetQty: mode === "mix_match" ? targetQty : null,
    discountType: (form.get("discountType") as string) || "percentage",
    discountValue: parseFloat((form.get("discountValue") as string) || "0"),
    combinable: form.get("combinable") === "on",
    triggerProductIds,
    visibility,
    visibilityCollectionIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
    styleOverrides: parsedStyleOverrides,
    textOverrides: parsedTextOverrides,
    freeGiftVariantId: (form.get("freeGiftVariantId") as string) || null,
    freeGiftProductId: (form.get("freeGiftProductId") as string) || null,
    subscription: parseSubscriptionForm(form.get("subscription")),
  };

  const v = validateBundle(input);
  if (!v.valid) {
    return json({ errors: v.errors }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);

  const linkedCountdownId = ((form.get("linkedCountdownId") as string) || "").trim() || null;
  const linkedProgressiveGiftId = ((form.get("linkedProgressiveGiftId") as string) || "").trim() || null;
  const stickyAtc = parseStickyAtc(form.get("stickyAtc") as string | null);
  const addonsOrder = parseAddonsOrder(form.get("addonsOrder") as string | null);

  await bundleRepo.update(db, session.shop, params.id!, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as
      | "percentage"
      | "flat"
      | "fixed_total",
    mode: input.mode,
    linkedCountdownId,
    linkedProgressiveGiftId,
    stickyAtc,
    addonsOrder,
  });

  try {
    await ensureDiscountNodes(admin, db, session.shop);
  } catch (err) {
    console.error("[app.bundles.$id action] ensureDiscountNodes failed (non-fatal):", err);
  }
  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[app.bundles.$id action] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect(`/app/bundles/${params.id!}?saved=${encodeURIComponent(input.name)}`);
}

export default function BundleEdit() {
  const { bundle, productDetails, collectionDetails, collectionTopProducts, giftVariantDetails, plan, countdownOptions, progressiveGiftOptions, allCountdowns, allProgressiveGifts } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
  const snippet = bundle.mode === "mix_match"
    ? `<div data-pumper-mix-match="${bundle.id}"></div>`
    : `<div data-pumper-bundle="${bundle.id}"></div>`;
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  const [values, setValues] = useState<BundleFormValues | null>(null);

  const collectionProductsFetcher = useFetcher<{ products: CollectionProduct[] }>();

  const collectionId = values?.collection?.collectionId ?? null;

  useEffect(() => {
    if (!collectionId) return;
    collectionProductsFetcher.load(
      `/api/admin/collection-products?id=${encodeURIComponent(collectionId)}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  // Use fetcher data when available (after collection change), otherwise fall back to loader seed
  const fetchedCollectionProducts =
    collectionProductsFetcher.data?.products ?? collectionTopProducts ?? null;

  const initial: Partial<BundleFormValues> = {
    name: bundle.name,
    mode: (bundle.mode ?? "classic") as "classic" | "mix_match",
    products: bundle.products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
      title: productDetails[p.productId]?.title,
      image: productDetails[p.productId]?.image ?? undefined,
    })),
    collection: collectionDetails ? {
      collectionId: collectionDetails.id,
      title: collectionDetails.title,
      image: collectionDetails.image ?? undefined,
    } : null,
    targetQty: bundle.targetQty ? String(bundle.targetQty) : "3",
    discountType: bundle.discountType as BundleFormValues["discountType"],
    discountValue: String(bundle.discountValue),
    combinable: bundle.combinable,
    visibility: ((bundle.visibility as BundleFormValues["visibility"] | undefined) ??
      (bundle.triggerProductIds.length > 0 ? "specific" : "same_as_members")) as BundleFormValues["visibility"],
    triggerProducts: bundle.triggerProductIds.map((id: string) => ({
      productId: id,
      variantId: null,
      qty: 1,
      title: productDetails[id]?.title,
      image: productDetails[id]?.image ?? undefined,
    })),
    visibilityCollections: (bundle.visibilityCollectionIds ?? []).map((cid: string) => ({
      collectionId: cid,
      title: cid,
    })),
    status: bundle.status as BundleFormValues["status"],
    headline: bundle.headline ?? "",
    ctaLabel: bundle.ctaLabel ?? "",
    ...styleOverridesToFormFields(bundle.styleOverrides as Record<string, unknown> | null),
    textOverrides: {
      "bundle.totalLabel": (bundle.textOverrides as Record<string, string> | null)?.["bundle.totalLabel"] ?? "",
      "bundle.savingsBadge": (bundle.textOverrides as Record<string, string> | null)?.["bundle.savingsBadge"] ?? "",
    },
    freeGiftEnabled: !!(bundle.freeGiftVariantId || bundle.freeGiftProductId),
    freeGiftMode: (bundle.freeGiftProductId
      ? "product"
      : bundle.freeGiftVariantId
        ? "variant"
        : "product") as "variant" | "product",
    freeGiftVariant: (() => {
      const id = bundle.freeGiftVariantId;
      const detail = id ? giftVariantDetails[id] : undefined;
      if (!id || !detail) return null;
      return {
        variantId: id,
        productId: "",
        productTitle: detail.productTitle,
        variantTitle: detail.variantTitle,
        image: detail.image ?? undefined,
      };
    })(),
    freeGiftProduct: bundle.freeGiftProductId
      ? {
          productId: bundle.freeGiftProductId,
          variantId: null,
          qty: 1,
          title: productDetails[bundle.freeGiftProductId]?.title ?? "",
          image: productDetails[bundle.freeGiftProductId]?.image ?? undefined,
        }
      : null,
    linkedCountdownId: bundle.linkedCountdownId ?? null,
    linkedProgressiveGiftId: bundle.linkedProgressiveGiftId ?? null,
    addonsOrder: (bundle.addonsOrder as AddonsOrderItem[] | null) ?? [...DEFAULT_ADDONS_ORDER],
    stickyAtc: bundle.stickyAtc
      ? { ...STICKY_ATC_DEFAULTS, ...bundle.stickyAtc, enabled: true }
      : { ...STICKY_ATC_DEFAULTS },
  };

  const previewConfig = values
    ? buildPreviewBundleConfig({
        shop: "preview",
        mockProduct: defaultMockProduct(),
        settings: defaultPreviewSettings(),
        bundle: {
          id: bundle.id,
          name: values.name,
          mode: values.mode,
          products:
            values.mode === "classic"
              ? values.products.map((p) => ({
                  productId: p.productId,
                  variantId: p.variantId,
                  qty: p.qty,
                  title: p.title ?? p.productId,
                  image: p.image ?? null,
                  available: true,
                  priceCents: 4999,
                }))
              : [],
          collectionId:
            values.mode === "mix_match"
              ? (values.collection?.collectionId ?? null)
              : null,
          targetQty:
            values.mode === "mix_match"
              ? parseInt(values.targetQty || "0", 10) || null
              : null,
          collectionProducts:
            values.mode === "mix_match" && values.collection
              ? fetchedCollectionProducts
              : null,
          discountType: values.discountType,
          discountValue: parseFloat(values.discountValue) || 0,
          combinable: values.combinable,
          triggerProductIds: values.triggerProducts.map((p) => p.productId),
          headline: values.headline || null,
          ctaLabel: values.ctaLabel || null,
          styleOverrides: buildStyleOverrides(values),
          textOverrides: buildTextOverrides(values.textOverrides),
          linkedCountdownId: values.linkedCountdownId,
          linkedProgressiveGiftId: values.linkedProgressiveGiftId,
          addonsOrder: values.addonsOrder,
          freeGiftVariantId: values.freeGiftEnabled && values.freeGiftMode === "variant"
            ? values.freeGiftVariant?.variantId ?? null
            : null,
          freeGiftVariantTitle: values.freeGiftEnabled && values.freeGiftMode === "variant"
            ? [values.freeGiftVariant?.productTitle, values.freeGiftVariant?.variantTitle]
                .filter(Boolean)
                .join(" – ") || null
            : null,
          freeGiftAvailable: values.freeGiftEnabled && values.freeGiftMode === "variant" && values.freeGiftVariant ? true : null,
          freeGiftProductId: values.freeGiftEnabled && values.freeGiftMode === "product"
            ? values.freeGiftProduct?.productId ?? null
            : null,
          freeGiftProductTitle: values.freeGiftEnabled && values.freeGiftMode === "product"
            ? values.freeGiftProduct?.title ?? null
            : null,
          freeGiftProductImage: values.freeGiftEnabled && values.freeGiftMode === "product"
            ? values.freeGiftProduct?.image ?? null
            : null,
          freeGiftProductVariants: values.freeGiftEnabled && values.freeGiftMode === "product" && values.freeGiftProduct
            ? [{ variantId: values.freeGiftProduct.variantId ?? "v0", title: values.freeGiftProduct.title ?? "Default", available: true, priceCents: 0 }]
            : null,
        },
        addons: {
          countdowns: allCountdowns,
          progressiveGifts: allProgressiveGifts,
        },
      })
    : null;

  return (
    <Page
      title={bundle.name}
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <BundleForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
            countdownOptions={countdownOptions}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </div>
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {previewConfig && (
            <PreviewPane
              type={values?.mode === "mix_match" ? "mix_match" : "bundle"}
              id={bundle.id}
              config={previewConfig}
            />
          )}
          {values?.stickyAtc.enabled && <StickyAtcPreview value={values.stickyAtc} />}
          <EmbedCodeCard plan={plan} snippet={snippet} />
        </div>
      </div>
    </Page>
  );
}
