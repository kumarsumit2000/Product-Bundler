import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { QbForm, type QbFormValues } from "~/components/QbForm";
import { PreviewPane } from "~/components/PreviewPane";
import { buildPreviewQbConfig, defaultPreviewSettings } from "~/lib/preview-config";
import type { TierFormValue } from "~/components/QbTierBuilder";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const qb = await qbRepo.getById(db, session.shop, params.id!);
  if (!qb) throw new Response("Not found", { status: 404 });

  let productTitle: string | undefined;
  let productImage: string | undefined;
  if (qb.productId) {
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
  }

  return json({ qb, productTitle, productImage });
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
      discountType: t.discountType as
        | "percentage"
        | "flat"
        | "fixed_per_unit",
      discountValue: t.discountValue,
      label: t.label,
      isMostPopular: t.isMostPopular,
    })),
    combinable: form.get("combinable") === "on",
  };

  const v = validateQb(input);
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
  });

  await ensureDiscountNodes(admin, db, session.shop);
  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect("/app/quantity-breaks");
}

export default function QbEdit() {
  const { qb, productTitle, productImage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
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
    })),
    combinable: qb.combinable,
    status: qb.status as QbFormValues["status"],
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
          styleOverrides: null,
        },
      })
    : null;

  return (
    <Page
      title={qb.name}
      backAction={{
        content: "Quantity Breaks",
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
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {previewConfig && (
            <PreviewPane type="qb" id={qb.id} config={previewConfig} />
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
