import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { validateBundle } from "~/lib/bundles/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import { BundleForm, type BundleFormValues } from "~/components/BundleForm";
import type { PickedProduct } from "~/components/ProductPicker";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
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

  return redirect("/app/bundles");
}

export default function BundleNew() {
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  return (
    <Page
      title="Create bundle"
      backAction={{ content: "Bundles", url: "/app/bundles" }}
    >
      <BundleForm submitLabel="Save bundle" errors={errors} />
    </Page>
  );
}
