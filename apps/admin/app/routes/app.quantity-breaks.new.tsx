import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import { getUsage } from "~/lib/billing/usage";
import { canCreateNew } from "~/lib/billing/gating";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { parseDateLocal } from "~/lib/parse-date-local";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { enrichProgressiveGiftsForPreview } from "~/lib/preview-pg-enrich";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { parseAddonsOrder } from "~/lib/parse-addons-order";
import { parseSubscriptionForm } from "~/lib/parse-subscription";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { QbForm, QB_FORM_ID, type QbFormValues } from "~/components/QbForm";
import { submitFormById } from "~/lib/submit-form-by-id";
import { qbTemplate } from "~/lib/template-presets";
import { PreviewPane } from "~/components/PreviewPane";
import { StickyAtcPreview } from "~/components/StickyAtcPreview";
import { buildPreviewQbConfig, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides } from "~/lib/preview-overrides";
import type { TierFormValue } from "~/components/QbTierBuilder";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import type { StyleOverrides, TextOverrides } from "../../drizzle/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const [usage, pgs] = await Promise.all([
    getUsage(db, session.shop),
        pgRepo.listByShop(db, session.shop),
  ]);
  const allProgressiveGifts = await enrichProgressiveGiftsForPreview(admin, pgs);
  const url = new URL(request.url);
  const template = url.searchParams.get("template");
  const theme = url.searchParams.get("theme");
  const preset = qbTemplate(template);
  const gate = canCreateNew(usage);
  return json({
    gate,
    plan: usage.plan,
    progressiveGiftOptions: pgs.map((p) => ({ id: p.id, name: p.name })),
    allProgressiveGifts,
    preset,
    theme,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
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
    tiers: tiersRaw.map((t) => ({
      qty: t.qty,
      discountType: t.discountType as "percentage" | "flat" | "fixed_per_unit",
      discountValue: t.discountValue,
      label: t.label,
      isMostPopular: t.isMostPopular,
      freeGiftVariantId: (t as { freeGiftVariantId?: string | null }).freeGiftVariantId ?? undefined,
      bogo: (() => {
        const raw = (t as { bogo?: { mode: "add_same" | "add_different" | "nth_free"; targetVariantId?: string | null; bonusQty: number } | null }).bogo;
        if (!raw) return undefined;
        return {
          mode: raw.mode,
          targetVariantId: raw.targetVariantId ?? undefined,
          bonusQty: raw.bonusQty,
        };
      })(),
      extraProducts: ((t as { extraProducts?: Array<{ productId: string; variantId: string | null; qty: number }> }).extraProducts ?? []),
    })),
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

  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  if (!gate.allowed) {
    return json({ errors: { _form: gate.reason } }, { status: 403 });
  }

  const created = await qbRepo.create(db, session.shop, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    collectionId: null,
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
    subscription: parseSubscriptionForm(form.get("subscription")),
    visibility: normalizedVisibility,
    visibilityProductIds,
    visibilityCollectionIds,
    checkboxUpsellsEnabled,
    checkboxUpsells,
    linkedProgressiveGiftId,
    linkedCountdownId: null,
    stickyAtc,
    addonsOrder,
    freeGiftVariantId,
    freeGiftProductId,
    freeGiftMinQty,
  });

  try {
    await ensureDiscountNodes(admin, db, session.shop);
  } catch (err) {
    console.error("[app.quantity-breaks.new action] ensureDiscountNodes failed (non-fatal):", err);
  }
  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[app.quantity-breaks.new action] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect(`/app/quantity-breaks/${created.id}?saved=${encodeURIComponent(input.name)}`);
}

export default function QbNew() {
  const { gate, plan, progressiveGiftOptions, allProgressiveGifts, preset, theme } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  const initialValues: Partial<QbFormValues> | undefined = preset
    ? {
        name: preset.name,
        headline: preset.headline,
        ctaLabel: preset.ctaLabel,
        tiers: preset.tiers.map((t) => ({
          qty: t.qty,
          discountType: t.discountType,
          discountValue: t.discountValue,
          label: t.label,
          isMostPopular: t.isMostPopular,
          bogoMode: (t.bogoMode ?? "") as "" | "add_same" | "add_different" | "nth_free",
          bogoBonusQty: t.bogoBonusQty ?? 1,
        })),
        ...(preset.freeGiftEnabled
          ? {
              freeGiftEnabled: true,
              freeGiftMinQty: String(preset.freeGiftMinQty ?? 1),
            }
          : {}),
        ...(theme ? { primaryColor: theme } : {}),
      }
    : undefined;

  const [values, setValues] = useState<QbFormValues | null>(null);

  if (!gate.allowed) {
    return (
      <Page title="Create quantity break" backAction={{ content: "Quantity breaks", url: "/app/quantity-breaks" }}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Text as="h2" variant="headingMd">Free plan limit reached</Text>
                <Text as="p" tone="subdued">{gate.reason}</Text>
                <Button variant="primary" url="/app/billing">Upgrade to create more</Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

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
          id: "new",
          name: values.name,
          productId: values.product[0]?.productId ?? "gid://shopify/Product/0",
          productTitle: values.product[0]?.title ?? "Sample product",
          productImage: values.product[0]?.image ?? null,
          productVariants: [
            {
              variantId:
                values.product[0]?.variantId ?? "v0",
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
      title="Create quantity break"
      backAction={{
        content: "Quantity breaks",
        url: "/app/quantity-breaks",
      }}
      primaryAction={{
        content: "Save quantity break",
        onAction: () => submitFormById(QB_FORM_ID),
        loading: isSubmitting,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <QbForm
            submitLabel="Save quantity break"
            errors={errors}
            initialValues={initialValues}
            onValuesChange={setValues}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </div>
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {previewConfig && (
            <PreviewPane type="qb" id="new" config={previewConfig} />
          )}
          {values?.stickyAtc.enabled && <StickyAtcPreview value={values.stickyAtc} />}
          <EmbedCodeCard plan={plan} />
        </div>
      </div>
    </Page>
  );
}
