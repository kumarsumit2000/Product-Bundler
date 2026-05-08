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
import { validateBundle } from "~/lib/bundles/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewBundleConfig, defaultMockProduct, defaultPreviewSettings } from "~/lib/preview-config";
import type { PickedProduct } from "~/components/ProductPicker";
import type { CollectionProduct } from "~/lib/shopify-product-fetch";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  return json({ gate });
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

  await bundleRepo.create(db, session.shop, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as
      | "percentage"
      | "flat"
      | "fixed_total",
    mode: input.mode,
    styleOverrides: null,
  });

  await ensureDiscountNodes(admin, db, session.shop);
  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect("/app/bundles?saved=" + encodeURIComponent(input.name));
}

export default function BundleNew() {
  const { gate } = useLoaderData<typeof loader>();
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
          styleOverrides: null,
        },
      })
    : null;

  return (
    <Page
      title="Create bundle"
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <Layout>
        <Layout.Section>
          <BundleForm
            submitLabel="Save bundle"
            errors={errors}
            onValuesChange={setValues}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && (
            <PreviewPane
              type={values?.mode === "mix_match" ? "mix_match" : "bundle"}
              id="new"
              config={previewConfig}
            />
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
