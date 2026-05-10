import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bxgyRepo from "~/lib/bxgy-offers/repo";
import * as countdownRepo from "~/lib/countdowns/repo";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { enrichProgressiveGiftsForPreview } from "~/lib/preview-pg-enrich";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { BxgyForm, type BxgyFormValues } from "~/components/BxgyForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewBxgyConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides } from "~/lib/preview-overrides";
import type { BxgyBarValue } from "~/components/BxgyBarBuilder";
import type { StyleOverrides } from "../../drizzle/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const [countdowns, pgs] = await Promise.all([
    countdownRepo.listByShop(db, session.shop),
    pgRepo.listByShop(db, session.shop),
  ]);
  const allProgressiveGifts = await enrichProgressiveGiftsForPreview(admin, pgs);
  const url = new URL(request.url);
  const template = url.searchParams.get("template");
  const theme = url.searchParams.get("theme");
  const preset = template === "bxgy" || template === "bxgy_classic"
    ? {
        name: "Buy X, get Y",
        headline: "Pick your deal",
        ctaLabel: "",
        bars: [
          { id: "bar-1", buyQty: 1, buyDiscountPercent: 0, getQty: 1, getDiscountPercent: 100, title: "Buy 1, get 1 free", subtitle: "", badgeStyle: "save_percent" as const, badgeText: "SAVE {{saved_percentage}}", label: "", isMostPopular: false },
          { id: "bar-2", buyQty: 2, buyDiscountPercent: 0, getQty: 3, getDiscountPercent: 100, title: "Buy 2, get 3 free", subtitle: "", badgeStyle: "save_percent" as const, badgeText: "SAVE {{saved_percentage}}", label: "", isMostPopular: false },
          { id: "bar-3", buyQty: 3, buyDiscountPercent: 0, getQty: 6, getDiscountPercent: 100, title: "Buy 3, get 6 free", subtitle: "", badgeStyle: "save_percent" as const, badgeText: "SAVE {{saved_percentage}}", label: "", isMostPopular: true },
        ],
      }
    : null;
  return json({
    preset,
    theme,
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
    allProgressiveGifts,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return json({ errors: { name: "Name is required" } }, { status: 400 });

  const productId = ((form.get("productId") as string) || "").trim();
  if (!productId) return json({ errors: { productId: "Pick a product" } }, { status: 400 });

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
  // For "specific" visibility, scope to the picked product.
  const visibilityProductIds = visibility === "specific" ? [productId] : visibilityProductIdsRaw;

  const linkedCountdownId = ((form.get("linkedCountdownId") as string) || "").trim() || null;
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

  const db = getDb(ctx.cloudflare.env.DB);
  const created = await bxgyRepo.create(db, session.shop, {
    name,
    productId,
    status: ((form.get("status") as string) || "draft") as "draft" | "active" | "paused",
    headline: ((form.get("headline") as string) || "") || null,
    ctaLabel: ((form.get("ctaLabel") as string) || "") || null,
    bars,
    combinable: form.get("combinable") === "on",
    visibility,
    visibilityProductIds,
    visibilityCollectionIds,
    styleOverrides: parsedStyleOverrides,
    textOverrides: null,
    linkedCountdownId,
    linkedProgressiveGiftId,
    stickyAtc,
    addonsOrder,
    freeGiftVariantId,
    freeGiftProductId,
    freeGiftMinBuyQty,
    checkboxUpsellsEnabled,
    checkboxUpsells,
  });

  try { await ensureDiscountNodes(admin, db, session.shop); } catch (err) { console.error("[bxgy.new] ensureDiscountNodes failed:", err); }
  try { await syncShopConfig(db, admin, session.shop); } catch (err) { console.error("[bxgy.new] syncShopConfig failed:", err); }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect(`/app/bxgy-offers/${created.id}?saved=${encodeURIComponent(name)}`);
}

export default function BxgyNew() {
  const { preset, countdownOptions, progressiveGiftOptions, allCountdowns, allProgressiveGifts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  const [values, setValues] = useState<BxgyFormValues | null>(null);

  const initialValues: Partial<BxgyFormValues> | undefined = preset
    ? {
        name: preset.name,
        headline: preset.headline,
        ctaLabel: preset.ctaLabel,
        bars: preset.bars,
      }
    : undefined;

  const previewConfig = values
    ? buildPreviewBxgyConfig({
        shop: "preview",
        mockProduct: defaultMockProduct(),
        settings: defaultPreviewSettings(),
        offer: {
          id: "new",
          name: values.name || "Sample offer",
          productId: values.product[0]?.productId ?? "gid://shopify/Product/0",
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
          countdowns: allCountdowns,
          progressiveGifts: allProgressiveGifts,
        },
      })
    : null;

  return (
    <Page title="Create BXGY offer" backAction={{ content: "Buy X, get Y", url: "/app/bxgy-offers" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <BxgyForm
            submitLabel="Save offer"
            errors={errors}
            initialValues={initialValues}
            onValuesChange={setValues}
            countdownOptions={countdownOptions}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </div>
        <div style={{ position: "sticky", top: 16 }}>
          {previewConfig && <PreviewPane type="bxgy" id="new" config={previewConfig} />}
        </div>
      </div>
    </Page>
  );
}
