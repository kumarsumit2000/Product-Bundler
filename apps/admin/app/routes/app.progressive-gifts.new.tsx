import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { useState } from "react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/progressive-gifts/repo";
import { validateProgressiveGift } from "~/lib/progressive-gifts/validate";
import { ProgressiveGiftForm, type ProgressiveGiftFormValues } from "~/components/ProgressiveGiftForm";
import { ProgressiveGiftPreview } from "~/components/ProgressiveGiftPreview";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { syncShopConfig } from "~/lib/metafield-sync";
import { ensureDiscountNodes } from "~/lib/discount-nodes";
import type { ProgressiveThreshold } from "../../drizzle/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
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
  const created = await repo.create(db, session.shop, {
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
  try {
    await ensureDiscountNodes(admin, db, session.shop);
  } catch (err) {
    console.error("[progressive-gifts.new action] ensureDiscountNodes failed (non-fatal):", err);
  }
  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[progressive-gifts.new action] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect(`/app/progressive-gifts/${created.id}?saved=${encodeURIComponent(input.name)}`);
}

export default function ProgressiveGiftNew() {
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  const [values, setValues] = useState<ProgressiveGiftFormValues | null>(null);
  return (
    <Page
      title="Create progressive gift"
      backAction={{ content: "Progressive gifts", url: "/app/progressive-gifts" }}
    >
      <Layout>
        <Layout.Section>
          {values && <ProgressiveGiftPreview values={values} />}
          <div style={{ height: 16 }} />
          <ProgressiveGiftForm
            submitLabel="Save progressive gift"
            errors={errors}
            onValuesChange={setValues}
          />
          <div style={{ height: 16 }} />
          <EmbedCodeCard plan="free" />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
