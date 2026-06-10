import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { parseDateLocal, toDatetimeLocal } from "~/lib/parse-date-local";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { enrichProgressiveGiftsForPreview } from "~/lib/preview-pg-enrich";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { parseSubscriptionForm, EMPTY_SUBSCRIPTION } from "~/lib/parse-subscription";
import { STICKY_ATC_DEFAULTS } from "~/components/StickyAtcCard";
import { DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "~/components/WidgetAddonsCard";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { QbForm, QB_FORM_ID, type QbFormValues } from "~/components/QbForm";
import { submitFormById } from "~/lib/submit-form-by-id";
import { PreviewPane } from "~/components/PreviewPane";
import { StickyAtcPreview } from "~/components/StickyAtcPreview";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { buildPreviewQbConfig, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides, styleOverridesToFormFields } from "~/lib/preview-overrides";
import type { TierFormValue } from "~/components/QbTierBuilder";
import { serializeTierForm } from "~/lib/serialize-qb-tier";
import { fetchVariantDetails, fetchProductDetails } from "~/lib/shopify-product-fetch";
import { getUsage } from "~/lib/billing/usage";
import { useSavedToast } from "~/lib/toast";
import type { StyleOverrides, TextOverrides } from "../../drizzle/schema";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const qb = await qbRepo.getById(db, session.shop, params.id!);
  if (!qb) throw new Response("Not found", { status: 404 });

  let productTitle: string | undefined;
  let productImage: string | undefined;
  if (qb.productId) {
    try {
      const res = await admin.graphql(
        `query Product($id: ID!) {
          product(id: $id) { id title featuredImage { url } }
        }`,
        { variables: { id: qb.productId } },
      );
      const data = (await res.json()) as {
        data: { product: { id: string; title: string; featuredImage: { url: string } | null } | null };
      };
      if (data.data.product) {
        productTitle = data.data.product.title;
        productImage = data.data.product.featuredImage?.url ?? undefined;
      }
    } catch (err) {
      console.error("[app.quantity-breaks.$id] product fetch failed (non-fatal):", err);
    }
  }

  // Collect all variant ids referenced by tier gift/BOGO config + the QB-level
  // free gift (when set in variant mode).
  const tierVariantIds = new Set<string>();
  for (const tr of qb.tiers) {
    if (tr.freeGiftVariantId) tierVariantIds.add(tr.freeGiftVariantId);
    if (tr.bogo?.targetVariantId) tierVariantIds.add(tr.bogo.targetVariantId);
  }
  if (qb.freeGiftVariantId) tierVariantIds.add(qb.freeGiftVariantId);
  const tierVariantDetails = await fetchVariantDetails(admin, [...tierVariantIds]).catch((err) => {
    console.error("[app.quantity-breaks.$id] fetchVariantDetails failed (non-fatal):", err);
    return {} as Awaited<ReturnType<typeof fetchVariantDetails>>;
  });

  const giftProductDetails = qb.freeGiftProductId
    ? await fetchProductDetails(admin, [qb.freeGiftProductId]).catch((err) => {
        console.error("[app.quantity-breaks.$id] gift product fetch failed (non-fatal):", err);
        return {} as Awaited<ReturnType<typeof fetchProductDetails>>;
      })
    : {};

  const [usage, pgs] = await Promise.all([
    getUsage(db, session.shop),
        pgRepo.listByShop(db, session.shop),
  ]);
  return json({
    qb, productTitle, productImage, tierVariantDetails, giftProductDetails, plan: usage.plan,
    progressiveGiftOptions: pgs.map((p) => ({ id: p.id, name: p.name })),
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

  const tiersRaw: TierFormValue[] = JSON.parse(
    (form.get("tiers") as string) || "[]"
  );

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    productId: (form.get("productId") as string) || "",
    tiers: tiersRaw.map(serializeTierForm),
    combinable: form.get("combinable") === "on",
    bindToCurrentProduct: form.get("bindToCurrentProduct") === "on",
    sortOrder: Math.max(0, parseInt((form.get("sortOrder") as string) || "0", 10) || 0),
    activeStartAt: parseDateLocal(form.get("activeStartAt") as string),
    activeEndAt: parseDateLocal(form.get("activeEndAt") as string),
    headline: null as string | null,
    ctaLabel: null as string | null,
    styleOverrides: null as StyleOverrides | null,
    textOverrides: null as TextOverrides | null,
  };

  const styleOverridesRaw = (form.get("styleOverrides") as string) || "{}";
  const textOverridesRaw = (form.get("textOverrides") as string) || "{}";
  try {
    const so = JSON.parse(styleOverridesRaw);
    const filteredSo: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(so)) {
      if (v !== undefined && v !== null && v !== "") filteredSo[k] = v;
    }
    input.styleOverrides = Object.keys(filteredSo).length > 0 ? (filteredSo as StyleOverrides) : null;
  } catch { input.styleOverrides = null; }
  try {
    const to = JSON.parse(textOverridesRaw);
    const filteredTo: Record<string, string> = {};
    for (const [k, v] of Object.entries(to)) {
      if (typeof v === "string" && v.length > 0) filteredTo[k] = v;
    }
    input.textOverrides = Object.keys(filteredTo).length > 0 ? (filteredTo as TextOverrides) : null;
  } catch { input.textOverrides = null; }
  input.headline = (form.get("headline") as string) || null;
  input.ctaLabel = (form.get("ctaLabel") as string) || null;

  const visibility = ((form.get("visibility") as string) || "specific");
  const visibilityProductIds = (() => { try { return JSON.parse((form.get("visibilityProductIds") as string) || "[]") as string[]; } catch { return []; } })();
  const visibilityCollectionIds = (() => { try { return JSON.parse((form.get("visibilityCollectionIds") as string) || "[]") as string[]; } catch { return []; } })();
  const checkboxUpsellsEnabled = form.get("checkboxUpsellsEnabled") === "on";
  const checkboxUpsells = (() => { try { return JSON.parse((form.get("checkboxUpsells") as string) || "[]") as never[]; } catch { return [] as never[]; } })();
  const linkedProgressiveGiftId = ((form.get("linkedProgressiveGiftId") as string) || "").trim() || null;
  const stickyAtc = parseStickyAtc(form.get("stickyAtc") as string | null);
  const addonsOrder = parseAddonsOrder(form.get("addonsOrder") as string | null);
  const freeGiftVariantId = ((form.get("freeGiftVariantId") as string) || "").trim() || null;
  const freeGiftProductId = ((form.get("freeGiftProductId") as string) || "").trim() || null;
  const freeGiftMinQty = Math.max(1, parseInt((form.get("freeGiftMinQty") as string) || "1", 10) || 1);
  const normalizedVisibility = ["all", "all_except", "specific", "collections"].includes(visibility)
    ? (visibility as "all" | "all_except" | "specific" | "collections")
    : "specific";

  const v = validateQb({
    ...input,
    visibility: normalizedVisibility,
    visibilityProductIds,
    visibilityCollectionIds,
  });
  if (!v.valid) {
    return json({ errors: v.errors }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);

  await qbRepo.update(db, session.shop, params.id!, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    tiers: input.tiers,
    combinable: input.combinable,
    bindToCurrentProduct: input.bindToCurrentProduct,
    sortOrder: input.sortOrder,
    activeStartAt: input.activeStartAt,
    activeEndAt: input.activeEndAt,
    styleOverrides: input.styleOverrides,
    textOverrides: input.textOverrides,
    headline: input.headline,
    ctaLabel: input.ctaLabel,
    visibility: normalizedVisibility,
    visibilityProductIds,
    visibilityCollectionIds,
    checkboxUpsellsEnabled,
    checkboxUpsells,
    linkedProgressiveGiftId,
    stickyAtc,
    addonsOrder,
    freeGiftVariantId,
    freeGiftProductId,
    freeGiftMinQty,
    subscription: parseSubscriptionForm(form.get("subscription")),
  });

  try {
    await ensureDiscountNodes(admin, db, session.shop);
  } catch (err) {
    console.error("[app.quantity-breaks.$id action] ensureDiscountNodes failed (non-fatal):", err);
  }
  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[app.quantity-breaks.$id action] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect(`/app/quantity-breaks/${params.id!}?saved=${encodeURIComponent(input.name)}`);
}

export default function QbEdit() {
  const { qb, productTitle, productImage, tierVariantDetails, giftProductDetails, plan, progressiveGiftOptions, allProgressiveGifts } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const snippet = `<div data-pumper-qb="${qb.id}"></div>`;
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  const [values, setValues] = useState<QbFormValues | null>(null);

  const initial: Partial<QbFormValues> = {
    name: qb.name,
    product: [
      {
        productId: qb.productId,
        variantId: null,
        qty: 1,
        title: productTitle,
        image: productImage,
      },
    ],
    tiers: qb.tiers.map((t) => ({
      qty: t.qty,
      discountType: t.discountType,
      discountValue: t.discountValue,
      label: t.label,
      isMostPopular: t.isMostPopular,
      freeGiftVariant: t.freeGiftVariantId && tierVariantDetails[t.freeGiftVariantId]
        ? {
            variantId: t.freeGiftVariantId,
            productId: "",
            productTitle: tierVariantDetails[t.freeGiftVariantId]!.productTitle,
            variantTitle: tierVariantDetails[t.freeGiftVariantId]!.variantTitle,
            image: tierVariantDetails[t.freeGiftVariantId]!.image ?? undefined,
          }
        : null,
      bogoMode: (t.bogo?.mode ?? "") as "" | "add_same" | "add_different" | "nth_free",
      bogoTargetVariant: t.bogo?.targetVariantId && tierVariantDetails[t.bogo.targetVariantId]
        ? {
            variantId: t.bogo.targetVariantId,
            productId: "",
            productTitle: tierVariantDetails[t.bogo.targetVariantId]!.productTitle,
            variantTitle: tierVariantDetails[t.bogo.targetVariantId]!.variantTitle,
            image: tierVariantDetails[t.bogo.targetVariantId]!.image ?? undefined,
          }
        : null,
      bogoBonusQty: t.bogo?.bonusQty ?? 1,
    })),
    combinable: qb.combinable,
    bindToCurrentProduct: qb.bindToCurrentProduct ?? false,
    sortOrder: String(qb.sortOrder ?? 0),
    activeStartAt: toDatetimeLocal(qb.activeStartAt as Date | null),
    activeEndAt: toDatetimeLocal(qb.activeEndAt as Date | null),
    status: qb.status as QbFormValues["status"],
    headline: qb.headline ?? "",
    ctaLabel: qb.ctaLabel ?? "",
    ...styleOverridesToFormFields(qb.styleOverrides as Record<string, unknown> | null),
    textOverrides: {
      "qb.tierLabel": (qb.textOverrides as Record<string, string> | null)?.["qb.tierLabel"] ?? "",
      "qb.savingsBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.savingsBadge"] ?? "",
      "qb.mostPopular": (qb.textOverrides as Record<string, string> | null)?.["qb.mostPopular"] ?? "",
      "qb.giftBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.giftBadge"] ?? "",
      "qb.freeGiftCallout": (qb.textOverrides as Record<string, string> | null)?.["qb.freeGiftCallout"] ?? "",
      "qb.freeGiftCallout.hidden": (qb.textOverrides as Record<string, string> | null)?.["qb.freeGiftCallout.hidden"] ?? "",
    },
    visibility: (qb.visibility as QbFormValues["visibility"]) ?? "specific",
    visibilityProducts: (qb.visibilityProductIds ?? []).map((pid) => ({
      productId: pid, variantId: null, qty: 1,
    })),
    visibilityCollections: (qb.visibilityCollectionIds ?? []).map((cid) => ({
      collectionId: cid, title: cid,
    })),
    linkedProgressiveGiftId: qb.linkedProgressiveGiftId ?? null,
    addonsOrder: (qb.addonsOrder as AddonsOrderItem[] | null) ?? [...DEFAULT_ADDONS_ORDER],
    stickyAtc: qb.stickyAtc
      ? { ...STICKY_ATC_DEFAULTS, ...qb.stickyAtc, enabled: true }
      : { ...STICKY_ATC_DEFAULTS },
    freeGiftEnabled: !!(qb.freeGiftVariantId || qb.freeGiftProductId),
    freeGiftMode: (qb.freeGiftProductId
      ? "product"
      : qb.freeGiftVariantId
        ? "variant"
        : "product") as "variant" | "product",
    freeGiftVariant: (() => {
      const id = qb.freeGiftVariantId;
      const detail = id ? tierVariantDetails[id] : undefined;
      if (!id || !detail) return null;
      return {
        variantId: id,
        productId: "",
        productTitle: detail.productTitle,
        variantTitle: detail.variantTitle,
        image: detail.image ?? undefined,
      };
    })(),
    freeGiftProduct: qb.freeGiftProductId
      ? {
          productId: qb.freeGiftProductId,
          variantId: null,
          qty: 1,
          title: giftProductDetails[qb.freeGiftProductId]?.title ?? "",
          image: giftProductDetails[qb.freeGiftProductId]?.image ?? undefined,
        }
      : null,
    freeGiftMinQty: String(qb.freeGiftMinQty ?? 1),
    checkboxUpsellsEnabled: qb.checkboxUpsellsEnabled ?? false,
    checkboxUpsells: (qb.checkboxUpsells ?? []).map((u) => ({
      id: u.id,
      mode: u.mode,
      product: u.productId
        ? {
            productId: u.productId,
            variantId: u.variantId,
            qty: 1,
            title: u.productTitle,
            image: u.productImage ?? undefined,
            priceCents: u.productPriceCents ?? undefined,
          }
        : null,
      discountType: u.discountType,
      discountValue: String(u.discountValue),
      title: u.title,
      subtitle: u.subtitle,
      selectedByDefault: u.selectedByDefault,
    })),
    subscription: qb.subscription ?? EMPTY_SUBSCRIPTION,
  };

  const previewConfig = values
    ? buildPreviewQbConfig({
        shop: "preview",
        mockProduct: {
          productId: values.product[0]?.productId ?? "gid://shopify/Product/0",
          title: values.product[0]?.title ?? "Sample",
          priceCents: 4999,
        },
        settings: defaultPreviewSettings(),
        qb: {
          id: qb.id,
          name: values.name,
          productId: values.product[0]?.productId ?? "gid://shopify/Product/0",
          productTitle: values.product[0]?.title ?? "Sample product",
          productImage: values.product[0]?.image ?? null,
          productVariants: [
            {
              variantId: values.product[0]?.variantId ?? "v0",
              title: "Default",
              available: true,
              priceCents: 4999,
            },
          ],
          tiers: values.tiers.map((tr) => ({
            qty: tr.qty,
            discountType: tr.discountType,
            discountValue: tr.discountValue,
            label: tr.label,
            isMostPopular: tr.isMostPopular,
            available: true,
            freeGiftVariantId: tr.freeGiftVariant?.variantId ?? null,
            freeGiftVariantTitle: tr.freeGiftVariant
              ? [tr.freeGiftVariant.productTitle, tr.freeGiftVariant.variantTitle].filter(Boolean).join(" – ") || null
              : null,
            freeGiftAvailable: tr.freeGiftVariant ? true : null,
            bogo: tr.bogoMode
              ? {
                  mode: tr.bogoMode as "add_same" | "add_different" | "nth_free",
                  targetVariantId: tr.bogoTargetVariant?.variantId ?? null,
                  bonusQty: tr.bogoBonusQty ?? 1,
                  targetAvailable: tr.bogoTargetVariant ? true : null,
                  targetVariantTitle: tr.bogoTargetVariant
                    ? [tr.bogoTargetVariant.productTitle, tr.bogoTargetVariant.variantTitle].filter(Boolean).join(" – ") || null
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
          })),
          combinable: values.combinable,
          styleOverrides: buildStyleOverrides(values),
          textOverrides: buildTextOverrides(values.textOverrides),
          headline: values.headline || null,
          ctaLabel: values.ctaLabel || null,
          checkboxUpsellsEnabled: values.checkboxUpsellsEnabled,
          checkboxUpsells: values.checkboxUpsells.map((u) => ({
            id: u.id,
            productId: u.product?.productId ?? "",
            variantId: u.product?.variantId ?? null,
            productTitle: u.product?.title ?? "",
            productImage: u.product?.image ?? null,
            productPriceCents: u.product?.priceCents ?? null,
            discountType: u.discountType,
            discountValue: parseFloat(u.discountValue) || 0,
            title: u.title,
            subtitle: u.subtitle,
          })),
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
          freeGiftMinQty: values.freeGiftEnabled ? Math.max(1, parseInt(values.freeGiftMinQty || "1", 10) || 1) : null,
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
          progressiveGifts: allProgressiveGifts,
        },
      })
    : null;

  return (
    <Page
      title={qb.name}
      backAction={{
        content: "Quantity breaks",
        url: "/app/quantity-breaks",
      }}
      primaryAction={{
        content: "Save changes",
        onAction: () => submitFormById(QB_FORM_ID),
        loading: isSubmitting,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <QbForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </div>
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {previewConfig && (
            <PreviewPane type="qb" id={qb.id} config={previewConfig} />
          )}
          {values?.stickyAtc.enabled && <StickyAtcPreview value={values.stickyAtc} />}
          <EmbedCodeCard plan={plan} snippet={snippet} />
        </div>
      </div>
    </Page>
  );
}
