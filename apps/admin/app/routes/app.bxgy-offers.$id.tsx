import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bxgyRepo from "~/lib/bxgy-offers/repo";
import { parseDateLocal, toDatetimeLocal } from "~/lib/parse-date-local";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { enrichProgressiveGiftsForPreview } from "~/lib/preview-pg-enrich";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { BxgyForm, BXGY_FORM_ID, type BxgyFormValues } from "~/components/BxgyForm";
import { submitFormById } from "~/lib/submit-form-by-id";
import { PreviewPane } from "~/components/PreviewPane";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { STICKY_ATC_DEFAULTS } from "~/components/StickyAtcCard";
import { DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "~/components/WidgetAddonsCard";
import { buildPreviewBxgyConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides, styleOverridesToFormFields } from "~/lib/preview-overrides";
import { useSavedToast } from "~/lib/toast";
import type { BxgyBarValue } from "~/components/BxgyBarBuilder";
import type { StyleOverrides, TextOverrides } from "../../drizzle/schema";

const ALLOWED_BXGY_TEXT_KEYS = new Set(["bxgy.freeGiftCallout", "bxgy.freeGiftCallout.hidden"]);

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const [offer, pgs] = await Promise.all([
    bxgyRepo.getById(db, session.shop, params.id!),
    pgRepo.listByShop(db, session.shop),
  ]);
  if (!offer) throw new Response("Not found", { status: 404 });
  const allProgressiveGifts = await enrichProgressiveGiftsForPreview(admin, pgs);
  return json({
    offer,
    progressiveGiftOptions: pgs.map((p) => ({ id: p.id, name: p.name })),
    allProgressiveGifts,
  });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return json({ errors: { name: "Name is required" } }, { status: 400 });

  const productId = ((form.get("productId") as string) || "").trim();
  const bindToCurrentProduct = form.get("bindToCurrentProduct") === "on";
  if (!productId && !bindToCurrentProduct) {
    return json({ errors: { productId: "Pick a product" } }, { status: 400 });
  }

  let bars: BxgyBarValue[] = [];
  try { bars = JSON.parse((form.get("bars") as string) || "[]"); } catch { bars = []; }
  if (bars.length === 0) {
    return json({ errors: { bars: "At least one bar is required" } }, { status: 400 });
  }

  const visibilityRaw = ((form.get("visibility") as string) || "specific");
  const visibility = ["all", "all_except", "specific", "collections"].includes(visibilityRaw)
    ? (visibilityRaw as "all" | "all_except" | "specific" | "collections")
    : "specific";
  const visibilityProductIdsRaw = (() => {
    try { return JSON.parse((form.get("visibilityProductIds") as string) || "[]") as string[]; }
    catch { return []; }
  })();
  const visibilityCollectionIds = (() => {
    try { return JSON.parse((form.get("visibilityCollectionIds") as string) || "[]") as string[]; }
    catch { return []; }
  })();
  const visibilityProductIds = visibility === "specific" ? [productId] : visibilityProductIdsRaw;

  const linkedProgressiveGiftId = ((form.get("linkedProgressiveGiftId") as string) || "").trim() || null;
  const stickyAtc = parseStickyAtc(form.get("stickyAtc") as string | null);
  const addonsOrder = parseAddonsOrder(form.get("addonsOrder") as string | null);
  const freeGiftVariantId = ((form.get("freeGiftVariantId") as string) || "").trim() || null;
  const freeGiftProductId = ((form.get("freeGiftProductId") as string) || "").trim() || null;
  const freeGiftMinBuyQty = Math.max(1, parseInt((form.get("freeGiftMinBuyQty") as string) || "1", 10) || 1);
  const checkboxUpsellsEnabled = form.get("checkboxUpsellsEnabled") === "on";
  const checkboxUpsells = (() => {
    try { return JSON.parse((form.get("checkboxUpsells") as string) || "[]") as never[]; }
    catch { return [] as never[]; }
  })();

  const styleOverridesRaw = (form.get("styleOverrides") as string) || "{}";
  let parsedStyleOverrides: StyleOverrides | null = null;
  try {
    const so = JSON.parse(styleOverridesRaw) as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(so)) {
      if (v !== undefined && v !== null && v !== "") filtered[k] = v;
    }
    parsedStyleOverrides = Object.keys(filtered).length > 0 ? (filtered as StyleOverrides) : null;
  } catch { parsedStyleOverrides = null; }

  const textOverridesRaw = (form.get("textOverrides") as string) || "{}";
  let parsedTextOverrides: TextOverrides | null = null;
  try {
    const to = JSON.parse(textOverridesRaw) as Record<string, unknown>;
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(to)) {
      if (!ALLOWED_BXGY_TEXT_KEYS.has(k)) continue;
      if (typeof v === "string" && v.length > 0 && v.length <= 120) filtered[k] = v;
    }
    parsedTextOverrides = Object.keys(filtered).length > 0 ? (filtered as TextOverrides) : null;
  } catch { parsedTextOverrides = null; }

  const db = getDb(ctx.cloudflare.env.DB);
  await bxgyRepo.update(db, session.shop, params.id!, {
    name,
    productId,
    status: ((form.get("status") as string) || "draft") as "draft" | "active" | "paused",
    headline: ((form.get("headline") as string) || "") || null,
    ctaLabel: ((form.get("ctaLabel") as string) || "") || null,
    bars,
    combinable: form.get("combinable") === "on",
    bindToCurrentProduct,
    sortOrder: Math.max(0, parseInt((form.get("sortOrder") as string) || "0", 10) || 0),
    activeStartAt: parseDateLocal(form.get("activeStartAt") as string),
    activeEndAt: parseDateLocal(form.get("activeEndAt") as string),
    visibility,
    visibilityProductIds,
    visibilityCollectionIds,
    styleOverrides: parsedStyleOverrides,
    textOverrides: parsedTextOverrides,
    linkedProgressiveGiftId,
    stickyAtc,
    addonsOrder,
    freeGiftVariantId,
    freeGiftProductId,
    freeGiftMinBuyQty,
    checkboxUpsellsEnabled,
    checkboxUpsells,
  });

  try { await ensureDiscountNodes(admin, db, session.shop); } catch (err) { console.error("[bxgy.$id] ensureDiscountNodes failed:", err); }
  try { await syncShopConfig(db, admin, session.shop); } catch (err) { console.error("[bxgy.$id] syncShopConfig failed:", err); }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect(`/app/bxgy-offers/${params.id!}?saved=${encodeURIComponent(name)}`);
}

export default function BxgyEdit() {
  const { offer, progressiveGiftOptions, allProgressiveGifts } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  const snippet = `<div data-pumper-bxgy="${offer.id}"></div>`;
  const [values, setValues] = useState<BxgyFormValues | null>(null);

  const initial: Partial<BxgyFormValues> = {
    name: offer.name,
    status: offer.status as BxgyFormValues["status"],
    product: offer.productId
      ? [{ productId: offer.productId, variantId: null, qty: 1 }]
      : [],
    headline: offer.headline ?? "",
    ctaLabel: offer.ctaLabel ?? "",
    bars: offer.bars,
    combinable: offer.combinable,
    bindToCurrentProduct: offer.bindToCurrentProduct ?? false,
    sortOrder: String(offer.sortOrder ?? 0),
    activeStartAt: toDatetimeLocal(offer.activeStartAt as Date | null),
    activeEndAt: toDatetimeLocal(offer.activeEndAt as Date | null),
    visibility: (offer.visibility as BxgyFormValues["visibility"]) ?? "specific",
    visibilityProducts: (offer.visibilityProductIds ?? [])
      .filter((id) => id !== offer.productId)
      .map((id) => ({ productId: id, variantId: null, qty: 1 })),
    visibilityCollections: (offer.visibilityCollectionIds ?? []).map((id) => ({
      collectionId: id, title: id,
    })),
    linkedProgressiveGiftId: offer.linkedProgressiveGiftId ?? null,
    addonsOrder: (offer.addonsOrder as AddonsOrderItem[] | null) ?? [...DEFAULT_ADDONS_ORDER],
    stickyAtc: offer.stickyAtc
      ? { ...STICKY_ATC_DEFAULTS, ...offer.stickyAtc, enabled: true }
      : { ...STICKY_ATC_DEFAULTS },
    freeGiftEnabled: !!(offer.freeGiftVariantId || offer.freeGiftProductId),
    freeGiftMode: (offer.freeGiftProductId
      ? "product"
      : offer.freeGiftVariantId
        ? "variant"
        : "product") as "variant" | "product",
    freeGiftMinBuyQty: String(offer.freeGiftMinBuyQty ?? 1),
    checkboxUpsellsEnabled: offer.checkboxUpsellsEnabled ?? false,
    checkboxUpsells: (offer.checkboxUpsells ?? []).map((u) => ({
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
    ...styleOverridesToFormFields(offer.styleOverrides as Record<string, unknown> | null),
    textOverrides: {
      "bxgy.freeGiftCallout": (offer.textOverrides as Record<string, string> | null)?.["bxgy.freeGiftCallout"] ?? "",
      "bxgy.freeGiftCallout.hidden": (offer.textOverrides as Record<string, string> | null)?.["bxgy.freeGiftCallout.hidden"] ?? "",
    },
  };

  const previewConfig = values
    ? buildPreviewBxgyConfig({
        shop: "preview",
        mockProduct: defaultMockProduct(),
        settings: defaultPreviewSettings(),
        offer: {
          id: offer.id,
          name: values.name || offer.name,
          productId: values.product[0]?.productId ?? offer.productId,
          productTitle: values.product[0]?.title ?? "Sample product",
          productImage: values.product[0]?.image ?? null,
          productVariants: [
            { variantId: values.product[0]?.variantId ?? "v0", title: "Default", available: true, priceCents: 4999 },
          ],
          bars: values.bars,
          combinable: values.combinable,
          headline: values.headline || null,
          ctaLabel: values.ctaLabel || null,
          styleOverrides: buildStyleOverrides(values),
          textOverrides: buildTextOverrides(values.textOverrides),
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
          freeGiftMinBuyQty: values.freeGiftEnabled
            ? Math.max(1, parseInt(values.freeGiftMinBuyQty || "1", 10) || 1)
            : null,
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
        },
        addons: {
          progressiveGifts: allProgressiveGifts,
        },
      })
    : null;

  return (
    <Page title={offer.name} backAction={{ content: "Buy X, get Y", url: "/app/bxgy-offers" }} primaryAction={{ content: "Save changes", onAction: () => submitFormById(BXGY_FORM_ID), loading: isSubmitting }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <BxgyForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </div>
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {previewConfig && <PreviewPane type="bxgy" id={offer.id} config={previewConfig} />}
          <EmbedCodeCard plan="free" snippet={snippet} />
        </div>
      </div>
    </Page>
  );
}
