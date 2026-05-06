import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { validateBundle } from "~/lib/bundles/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import type { PickedProduct } from "~/components/ProductPicker";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundle = await bundleRepo.getById(db, session.shop, params.id!);
  if (!bundle) throw new Response("Not found", { status: 404 });
  return json({ bundle });
}

export async function action({
  request,
  params,
  context,
}: ActionFunctionArgs) {
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

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    products: products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    discountType: (form.get("discountType") as string) || "percentage",
    discountValue: parseFloat((form.get("discountValue") as string) || "0"),
    combinable: form.get("combinable") === "on",
    triggerProductIds,
    headline: (form.get("headline") as string) || null,
    ctaLabel: (form.get("ctaLabel") as string) || null,
  };

  const v = validateBundle(input);
  if (!v.valid) {
    return json({ errors: v.errors }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);

  await bundleRepo.update(db, session.shop, params.id!, {
    ...input,
    status: input.status as "draft" | "active" | "paused",
    discountType: input.discountType as
      | "percentage"
      | "flat"
      | "fixed_total",
  });

  await ensureDiscountNodes(admin, db, session.shop);
  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect("/app/bundles");
}

export default function BundleEdit() {
  const { bundle } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  const initial: Partial<BundleFormValues> = {
    name: bundle.name,
    products: bundle.products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      qty: p.qty,
    })),
    discountType: bundle.discountType as BundleFormValues["discountType"],
    discountValue: String(bundle.discountValue),
    combinable: bundle.combinable,
    triggerMode:
      bundle.triggerProductIds.length > 0 ? "specific" : "same_as_members",
    triggerProducts: bundle.triggerProductIds.map((id: string) => ({
      productId: id,
      variantId: null,
      qty: 1,
    })),
    status: bundle.status as BundleFormValues["status"],
    headline: bundle.headline ?? "",
    ctaLabel: bundle.ctaLabel ?? "",
  };

  return (
    <Page
      title={bundle.name}
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <BundleForm
        submitLabel="Save changes"
        errors={errors}
        initialValues={initial}
      />
    </Page>
  );
}
