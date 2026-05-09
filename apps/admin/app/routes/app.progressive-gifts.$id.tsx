import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/progressive-gifts/repo";
import { validateProgressiveGift } from "~/lib/progressive-gifts/validate";
import { useState } from "react";
import { ProgressiveGiftForm, type ProgressiveGiftFormValues } from "~/components/ProgressiveGiftForm";
import { ProgressiveGiftPreview } from "~/components/ProgressiveGiftPreview";
import { fetchVariantDetails } from "~/lib/shopify-product-fetch";
import { useSavedToast } from "~/lib/toast";
import type { ProgressiveThreshold } from "../../drizzle/schema";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const pg = await repo.getById(db, session.shop, params.id!);
  if (!pg) throw new Response("Not found", { status: 404 });

  const variantIds = pg.thresholds.map((t) => t.giftVariantId).filter(Boolean);
  const variantDetails = await fetchVariantDetails(admin, variantIds).catch((err) => {
    console.error("[progressive-gifts.$id] fetchVariantDetails failed (non-fatal):", err);
    return {} as Awaited<ReturnType<typeof fetchVariantDetails>>;
  });

  return json({ pg, variantDetails });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const thresholdsRaw = (form.get("thresholds") as string) || "[]";
  const thresholds: ProgressiveThreshold[] = JSON.parse(thresholdsRaw);

  const input = {
    name: (form.get("name") as string) || "",
    status: (form.get("status") as string) || "draft",
    thresholds,
    headline: (form.get("headline") as string) || null,
  };

  const v = validateProgressiveGift(input);
  if (!v.valid) return json({ errors: v.errors }, { status: 400 });

  const db = getDb(ctx.cloudflare.env.DB);
  await repo.update(db, session.shop, params.id!, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    thresholds: input.thresholds,
    headline: input.headline,
  });
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect(`/app/progressive-gifts/${params.id!}?saved=${encodeURIComponent(input.name)}`);
}

export default function ProgressiveGiftEdit() {
  const { pg, variantDetails } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  const [values, setValues] = useState<ProgressiveGiftFormValues | null>(null);

  const initial: Partial<ProgressiveGiftFormValues> = {
    name: pg.name,
    status: pg.status as ProgressiveGiftFormValues["status"],
    headline: pg.headline ?? "",
    thresholds: pg.thresholds.map((t) => ({
      minSpend: (t.minSpendCents / 100).toString(),
      label: t.label,
      variant: t.giftVariantId && variantDetails[t.giftVariantId]
        ? {
            variantId: t.giftVariantId,
            productId: "",
            productTitle: variantDetails[t.giftVariantId]!.productTitle,
            variantTitle: variantDetails[t.giftVariantId]!.variantTitle,
            image: variantDetails[t.giftVariantId]!.image ?? undefined,
          }
        : null,
    })),
  };

  return (
    <Page
      title={pg.name}
      backAction={{ content: "Progressive gifts", url: "/app/progressive-gifts" }}
    >
      <Layout>
        <Layout.Section>
          <ProgressiveGiftForm
            submitLabel="Save changes"
            initialValues={initial}
            errors={errors}
            onValuesChange={setValues}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {values && <ProgressiveGiftPreview values={values} />}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
