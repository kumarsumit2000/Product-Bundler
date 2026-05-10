import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bxgyRepo from "~/lib/bxgy-offers/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BxgyForm, type BxgyFormValues } from "~/components/BxgyForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewBxgyConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import type { BxgyBarValue } from "~/components/BxgyBarBuilder";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
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
  return json({ preset, theme });
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

  const db = getDb(ctx.cloudflare.env.DB);
  const created = await bxgyRepo.create(db, session.shop, {
    name,
    productId,
    status: ((form.get("status") as string) || "draft") as "draft" | "active" | "paused",
    headline: ((form.get("headline") as string) || "") || null,
    ctaLabel: ((form.get("ctaLabel") as string) || "") || null,
    bars,
    combinable: form.get("combinable") === "on",
    visibility: "specific",
    visibilityProductIds: [productId],
    visibilityCollectionIds: [],
    styleOverrides: null,
    textOverrides: null,
    linkedCountdownId: null,
    linkedProgressiveGiftId: null,
    stickyAtc: null,
    addonsOrder: null,
    freeGiftVariantId: null,
    freeGiftProductId: null,
    freeGiftMinBuyQty: 1,
  });

  try { await ensureDiscountNodes(admin, db, session.shop); } catch (err) { console.error("[bxgy.new] ensureDiscountNodes failed:", err); }
  try { await syncShopConfig(db, admin, session.shop); } catch (err) { console.error("[bxgy.new] syncShopConfig failed:", err); }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect(`/app/bxgy-offers/${created.id}?saved=${encodeURIComponent(name)}`);
}

export default function BxgyNew() {
  const { preset } = useLoaderData<typeof loader>();
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
        },
      })
    : null;

  return (
    <Page title="Create BXGY offer" backAction={{ content: "Buy X, get Y", url: "/app/bxgy-offers" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          <BxgyForm submitLabel="Save offer" errors={errors} initialValues={initialValues} onValuesChange={setValues} />
        </div>
        <div style={{ position: "sticky", top: 16 }}>
          {previewConfig && <PreviewPane type="bxgy" id="new" config={previewConfig} />}
        </div>
      </div>
    </Page>
  );
}
