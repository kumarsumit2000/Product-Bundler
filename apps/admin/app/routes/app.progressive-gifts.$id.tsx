import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/progressive-gifts/repo";
import { validateProgressiveGift } from "~/lib/progressive-gifts/validate";
import { useState } from "react";
import { ProgressiveGiftForm, type ProgressiveGiftFormValues, progressiveStyleFromOverrides } from "~/components/ProgressiveGiftForm";
import { ProgressiveGiftPreview } from "~/components/ProgressiveGiftPreview";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
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

  let styleOverrides: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse((form.get("styleOverrides") as string) || "{}");
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
      styleOverrides = parsed;
    }
  } catch { /* ignore */ }

  const db = getDb(ctx.cloudflare.env.DB);
  const layout = ((form.get("layout") as string) || "grid");
  const subtitle = (form.get("subtitle") as string) || null;
  await repo.update(db, session.shop, params.id!, {
    name: input.name,
    status: input.status as "draft" | "active" | "paused",
    thresholds: input.thresholds,
    headline: input.headline,
    subtitle,
    layout: ["stacked", "grid", "inline"].includes(layout) ? layout : "grid",
    hideLocked: form.get("hideLocked") === "on",
    showLockedLabels: form.get("showLockedLabels") === "on",
    styleOverrides: styleOverrides as never,
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
    subtitle: pg.subtitle ?? "",
    layout: (pg.layout as ProgressiveGiftFormValues["layout"]) ?? "grid",
    hideLocked: pg.hideLocked ?? false,
    showLockedLabels: pg.showLockedLabels ?? true,
    style: progressiveStyleFromOverrides(pg.styleOverrides),
    thresholds: pg.thresholds.map((t) => ({
      minSpend: (t.minSpendCents / 100).toString(),
      label: t.label,
      title: t.title ?? "",
      lockedTitle: t.lockedTitle ?? "",
      labelCrossedOut: t.labelCrossedOut ?? "",
      lockedLabel: t.lockedLabel ?? "",
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
          {values && <ProgressiveGiftPreview values={values} />}
          <div style={{ height: 16 }} />
          <ProgressiveGiftForm
            submitLabel="Save changes"
            initialValues={initial}
            errors={errors}
            onValuesChange={setValues}
          />
          <div style={{ height: 16 }} />
          <EmbedCodeCard plan="free" snippet={`<div data-pumper-progressive="${pg.id}"></div>`} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
