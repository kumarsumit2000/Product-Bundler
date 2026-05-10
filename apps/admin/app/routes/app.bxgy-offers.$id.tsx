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
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { buildPreviewBxgyConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import { useSavedToast } from "~/lib/toast";
import type { BxgyBarValue } from "~/components/BxgyBarBuilder";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const offer = await bxgyRepo.getById(db, session.shop, params.id!);
  if (!offer) throw new Response("Not found", { status: 404 });
  return json({ offer });
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

  const db = getDb(ctx.cloudflare.env.DB);
  await bxgyRepo.update(db, session.shop, params.id!, {
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
  });

  try { await ensureDiscountNodes(admin, db, session.shop); } catch (err) { console.error("[bxgy.$id] ensureDiscountNodes failed:", err); }
  try { await syncShopConfig(db, admin, session.shop); } catch (err) { console.error("[bxgy.$id] syncShopConfig failed:", err); }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect(`/app/bxgy-offers/${params.id!}?saved=${encodeURIComponent(name)}`);
}

export default function BxgyEdit() {
  const { offer } = useLoaderData<typeof loader>();
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
          <BxgyForm submitLabel="Save changes" errors={errors} initialValues={initial} onValuesChange={setValues} />
        </div>
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {previewConfig && <PreviewPane type="bxgy" id={offer.id} config={previewConfig} />}
          <EmbedCodeCard plan="free" snippet={snippet} />
        </div>
      </div>
    </Page>
  );
}
