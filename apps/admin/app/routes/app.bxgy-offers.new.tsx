import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bxgyRepo from "~/lib/bxgy-offers/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BxgyForm, type BxgyFormValues } from "~/components/BxgyForm";
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

  const initialValues: Partial<BxgyFormValues> | undefined = preset
    ? {
        name: preset.name,
        headline: preset.headline,
        ctaLabel: preset.ctaLabel,
        bars: preset.bars,
      }
    : undefined;

  return (
    <Page title="Create BXGY offer" backAction={{ content: "Buy X, get Y", url: "/app/bxgy-offers" }}>
      <Layout>
        <Layout.Section>
          <BxgyForm submitLabel="Save offer" errors={errors} initialValues={initialValues} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
