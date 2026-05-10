import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import * as countdownRepo from "~/lib/countdowns/repo";
import * as pgRepo from "~/lib/progressive-gifts/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { parseSubscriptionForm } from "~/lib/parse-subscription";
import { parseStickyAtc } from "~/lib/parse-sticky-atc";
import { STICKY_ATC_DEFAULTS } from "~/components/StickyAtcCard";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { QbForm, type QbFormValues } from "~/components/QbForm";
import { PreviewPane } from "~/components/PreviewPane";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { buildPreviewQbConfig, defaultPreviewSettings } from "~/lib/preview-config";
import { buildStyleOverrides, buildTextOverrides, styleOverridesToFormFields } from "~/lib/preview-overrides";
import type { TierFormValue } from "~/components/QbTierBuilder";
import { fetchVariantDetails } from "~/lib/shopify-product-fetch";
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

  // Collect all variant ids referenced by tier gift/BOGO config
  const tierVariantIds = new Set<string>();
  for (const tr of qb.tiers) {
    if (tr.freeGiftVariantId) tierVariantIds.add(tr.freeGiftVariantId);
    if (tr.bogo?.targetVariantId) tierVariantIds.add(tr.bogo.targetVariantId);
  }
  const tierVariantDetails = await fetchVariantDetails(admin, [...tierVariantIds]).catch((err) => {
    console.error("[app.quantity-breaks.$id] fetchVariantDetails failed (non-fatal):", err);
    return {} as Awaited<ReturnType<typeof fetchVariantDetails>>;
  });

  const [usage, countdowns, pgs] = await Promise.all([
    getUsage(db, session.shop),
    countdownRepo.listByShop(db, session.shop),
    pgRepo.listByShop(db, session.shop),
  ]);
  return json({
    qb, productTitle, productImage, tierVariantDetails, plan: usage.plan,
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
    headline: null as string | null,
    ctaLabel: null as string | null,
    styleOverrides: null as StyleOverrides | null,
    textOverrides: null as TextOverrides | null,
    subscription: parseSubscriptionForm(form.get("subscription")),
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
  const linkedCountdownId = ((form.get("linkedCountdownId") as string) || "").trim() || null;
  const linkedProgressiveGiftId = ((form.get("linkedProgressiveGiftId") as string) || "").trim() || null;
  const stickyAtc = parseStickyAtc(form.get("stickyAtc") as string | null);
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
    styleOverrides: input.styleOverrides,
    textOverrides: input.textOverrides,
    headline: input.headline,
    ctaLabel: input.ctaLabel,
    visibility: normalizedVisibility,
    visibilityProductIds,
    visibilityCollectionIds,
    checkboxUpsellsEnabled,
    checkboxUpsells,
    linkedCountdownId,
    linkedProgressiveGiftId,
    stickyAtc,
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
  const { qb, productTitle, productImage, tierVariantDetails, plan, countdownOptions, progressiveGiftOptions, allCountdowns, allProgressiveGifts } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
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
    status: qb.status as QbFormValues["status"],
    headline: qb.headline ?? "",
    ctaLabel: qb.ctaLabel ?? "",
    ...styleOverridesToFormFields(qb.styleOverrides as Record<string, unknown> | null),
    textOverrides: {
      "qb.tierLabel": (qb.textOverrides as Record<string, string> | null)?.["qb.tierLabel"] ?? "",
      "qb.savingsBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.savingsBadge"] ?? "",
      "qb.mostPopular": (qb.textOverrides as Record<string, string> | null)?.["qb.mostPopular"] ?? "",
      "qb.giftBadge": (qb.textOverrides as Record<string, string> | null)?.["qb.giftBadge"] ?? "",
    },
    visibility: (qb.visibility as QbFormValues["visibility"]) ?? "specific",
    visibilityProducts: (qb.visibilityProductIds ?? []).map((pid) => ({
      productId: pid, variantId: null, qty: 1,
    })),
    visibilityCollections: (qb.visibilityCollectionIds ?? []).map((cid) => ({
      collectionId: cid, title: cid,
    })),
    linkedCountdownId: qb.linkedCountdownId ?? null,
    linkedProgressiveGiftId: qb.linkedProgressiveGiftId ?? null,
    stickyAtc: qb.stickyAtc
      ? { ...STICKY_ATC_DEFAULTS, ...qb.stickyAtc, enabled: true }
      : { ...STICKY_ATC_DEFAULTS },
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
      title={qb.name}
      backAction={{
        content: "Quantity breaks",
        url: "/app/quantity-breaks",
      }}
    >
      <Layout>
        <Layout.Section>
          <QbForm
            submitLabel="Save changes"
            errors={errors}
            initialValues={initial}
            onValuesChange={setValues}
            countdownOptions={countdownOptions}
            progressiveGiftOptions={progressiveGiftOptions}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && (
            <PreviewPane type="qb" id={qb.id} config={previewConfig} />
          )}
        </Layout.Section>
        <Layout.Section>
          <EmbedCodeCard plan={plan} snippet={snippet} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
