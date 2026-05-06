import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { validateQb } from "~/lib/quantity-breaks/validate";
import { syncShopConfig } from "~/lib/metafield-sync";
import { QbForm } from "~/components/QbForm";
import type { TierFormValue } from "~/components/QbTierBuilder";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
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

  await qbRepo.create(db, session.shop, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    productId: input.productId,
    collectionId: null,
    tiers: input.tiers,
    combinable: input.combinable,
    styleOverrides: null,
  });

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(
    `config:${session.shop}`
  );

  return redirect("/app/quantity-breaks");
}

export default function QbNew() {
  const actionData = useActionData<typeof action>();
  const errors =
    actionData && "errors" in actionData ? actionData.errors : undefined;

  return (
    <Page
      title="Create quantity break"
      backAction={{
        content: "Quantity Breaks",
        url: "/app/quantity-breaks",
      }}
    >
      <QbForm submitLabel="Save quantity break" errors={errors} />
    </Page>
  );
}
