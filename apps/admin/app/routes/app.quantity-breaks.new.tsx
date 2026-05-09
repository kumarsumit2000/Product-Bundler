import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import { getUsage } from "~/lib/billing/usage";
import { canCreateNew } from "~/lib/billing/gating";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { QbForm, type QbFormValues } from "~/components/QbForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewQbConfig, defaultPreviewSettings } from "~/lib/preview-config";
import type { TierFormValue } from "~/components/QbTierBuilder";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const usage = await getUsage(db, session.shop);
  const gate = canCreateNew(usage);
  return json({ gate, plan: usage.plan });
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
    })),
    combinable: form.get("combinable") === "on",
    headline: null,
    ctaLabel: null,
    styleOverrides: null,
    textOverrides: null,
  };

  const v = validateQb(input);
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
    styleOverrides: null,
    textOverrides: null,
    headline: null,
    ctaLabel: null,
  });

  await ensureDiscountNodes(admin, db, session.shop);
  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect(`/app/quantity-breaks/${created.id}?saved=${encodeURIComponent(input.name)}`);
}

export default function QbNew() {
  const { gate, plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

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
          })),
          combinable: values.combinable,
          styleOverrides: null,
          textOverrides: null,
          headline: null,
          ctaLabel: null,
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
    >
      <Layout>
        <Layout.Section>
          <QbForm
            submitLabel="Save quantity break"
            errors={errors}
            onValuesChange={setValues}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && (
            <PreviewPane type="qb" id="new" config={previewConfig} />
          )}
        </Layout.Section>
        <Layout.Section>
          <EmbedCodeCard plan={plan} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
