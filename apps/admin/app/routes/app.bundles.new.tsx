import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import { getUsage } from "~/lib/billing/usage";
import { canCreateNew } from "~/lib/billing/gating";
import * as bundleRepo from "~/lib/bundles/repo";
import * as countdownRepo from "~/lib/countdowns/repo";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { validateBundle } from "~/lib/bundles/validate";
import { parseSubscriptionForm } from "~/lib/parse-subscription";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewBundleConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides } from "~/lib/preview-overrides";
import type { PickedProduct } from "~/components/ProductPicker";
import type { CollectionProduct } from "~/lib/shopify-product-fetch";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const [usage, countdowns, pgs] = await Promise.all([
    getUsage(db, session.shop),
    countdownRepo.listByShop(db, session.shop),
    pgRepo.listByShop(db, session.shop),
  ]);
  const gate = canCreateNew(usage);
  return json({
    gate,
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
    allProgressiveGifts: pgs
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: p.id,
        name: p.name,
        headline: p.headline,
        subtitle: p.subtitle,
        layout: p.layout as "stacked" | "grid" | "inline",
        hideLocked: p.hideLocked,
        showLockedLabels: p.showLockedLabels,
        styleOverrides: (p.styleOverrides ?? null) as Record<string, unknown> | null,
        thresholds: p.thresholds.map((t) => ({
          minSpendCents: t.minSpendCents,
          kind: (t.kind ?? "free_gift") as "free_gift" | "free_shipping",
          label: t.label,
          title: t.title ?? null,
          lockedTitle: t.lockedTitle ?? null,
          labelCrossedOut: t.labelCrossedOut ?? null,
          lockedLabel: t.lockedLabel ?? null,
          iconUrl: t.iconUrl ?? null,
          giftProductId: t.giftProductId ?? null,
          giftVariantId: t.giftVariantId ?? null,
          productTitle: null,
          productImage: null,
          variants: [] as Array<{ variantId: string; title: string; available: boolean; priceCents: number }>,
        })),
      })),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();

  const products: PickedProduct[] = JSON.parse(
    (form.get("products") as string) || "[]"
  );
  const triggerProducts: PickedProduct[] = JSON.parse(
    (form.get("triggerProducts") as string) || "[]"
  );
  const triggerMode = form.get("triggerMode") as string;
  const triggerProductIds =
    triggerMode === "specific"
      ? triggerProducts.map((p) => p.productId)
      : [];

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
    triggerProductIds: mode === "mix_match" ? [] : triggerProductIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
    styleOverrides: parsedStyleOverrides,
    textOverrides: parsedTextOverrides,
    freeGiftVariantId: (form.get("freeGiftVariantId") as string) || null,
    subscription: parseSubscriptionForm(form.get("subscription")),
  };

  const v = validateBundle(input);
  if (!v.valid) {
    return json({ errors: v.errors, values: input }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);

  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  if (!gate.allowed) {
    return json({ errors: { _form: gate.reason }, values: input }, { status: 403 });
  }

  const linkedCountdownId = ((form.get("linkedCountdownId") as string) || "").trim() || null;
  const linkedProgressiveGiftId = ((form.get("linkedProgressiveGiftId") as string) || "").trim() || null;
  const stickyAtc = parseStickyAtc(form.get("stickyAtc") as string | null);
  const created = await bundleRepo.create(db, session.shop, {
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
  });

  try {
    await ensureDiscountNodes(admin, db, session.shop);
  } catch (err) {
    console.error("[app.bundles.new action] ensureDiscountNodes failed (non-fatal):", err);
  }
  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[app.bundles.new action] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect(`/app/bundles/${created.id}?saved=${encodeURIComponent(input.name)}`);
}

export default function BundleNew() {
  const { gate, plan, countdownOptions, progressiveGiftOptions, allCountdowns, allProgressiveGifts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
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

  if (!gate.allowed) {
    return (
      <Page title="Create bundle" backAction={{ content: "Bundles", url: "/app/bundles" }}>
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

  const fetchedCollectionProducts = collectionProductsFetcher.data?.products ?? null;

  const previewConfig = values
    ? buildPreviewBundleConfig({
        shop: "preview",
        mockProduct: defaultMockProduct(),
        settings: defaultPreviewSettings(),
        bundle: {
          id: "new",
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
        },
        addons: {
          countdowns: allCountdowns,
          progressiveGifts: allProgressiveGifts,
        },
      })
    : null;

  return (
    <Page
      title="Create bundle"
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <Layout>
        <Layout.Section variant="oneHalf">
          <BundleForm
            submitLabel="Save bundle"
            errors={errors}
            onValuesChange={setValues}
            countdownOptions={countdownOptions}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </Layout.Section>
        <Layout.Section variant="oneHalf">
          <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            {previewConfig && (
              <PreviewPane
                type={values?.mode === "mix_match" ? "mix_match" : "bundle"}
                id="new"
                config={previewConfig}
              />
            )}
            <EmbedCodeCard plan={plan} />
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
