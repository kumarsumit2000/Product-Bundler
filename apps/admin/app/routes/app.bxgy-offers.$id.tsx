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
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { BxgyForm, type BxgyFormValues } from "~/components/BxgyForm";
import { PreviewPane } from "~/components/PreviewPane";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { STICKY_ATC_DEFAULTS } from "~/components/StickyAtcCard";
import { DEFAULT_ADDONS_ORDER, type AddonsOrderItem } from "~/components/WidgetAddonsCard";
import { buildPreviewBxgyConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { styleOverridesToFormFields } from "~/lib/preview-overrides";
import { useSavedToast } from "~/lib/toast";
import type { BxgyBarValue } from "~/components/BxgyBarBuilder";
import type { StyleOverrides } from "../../drizzle/schema";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const [offer, countdowns, pgs] = await Promise.all([
    bxgyRepo.getById(db, session.shop, params.id!),
    countdownRepo.listByShop(db, session.shop),
    pgRepo.listByShop(db, session.shop),
  ]);
  if (!offer) throw new Response("Not found", { status: 404 });
  return json({
    offer,
    countdownOptions: countdowns.map((c) => ({ id: c.id, name: c.name })),
    progressiveGiftOptions: pgs.map((p) => ({ id: p.id, name: p.name })),
  });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
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
  await bxgyRepo.update(db, session.shop, params.id!, {
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

  try { await ensureDiscountNodes(admin, db, session.shop); } catch (err) { console.error("[bxgy.$id] ensureDiscountNodes failed:", err); }
  try { await syncShopConfig(db, admin, session.shop); } catch (err) { console.error("[bxgy.$id] syncShopConfig failed:", err); }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect(`/app/bxgy-offers/${params.id!}?saved=${encodeURIComponent(name)}`);
}

export default function BxgyEdit() {
  const { offer, countdownOptions, progressiveGiftOptions } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
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
    visibility: (offer.visibility as BxgyFormValues["visibility"]) ?? "specific",
    visibilityProducts: (offer.visibilityProductIds ?? [])
      .filter((id) => id !== offer.productId)
      .map((id) => ({ productId: id, variantId: null, qty: 1 })),
    visibilityCollections: (offer.visibilityCollectionIds ?? []).map((id) => ({
      collectionId: id, title: id,
    })),
    linkedCountdownId: offer.linkedCountdownId ?? null,
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
        },
      })
    : null;

  return (
    <Page title={offer.name} backAction={{ content: "Buy X, get Y", url: "/app/bxgy-offers" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <BxgyForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
            countdownOptions={countdownOptions}
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
