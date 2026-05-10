import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData, useLoaderData } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/countdowns/repo";
import { useState } from "react";
import { CountdownForm, type CountdownFormValues } from "~/components/CountdownForm";
import { CountdownPreview } from "~/components/CountdownPreview";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { useSavedToast } from "~/lib/toast";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const ct = await repo.getById(db, session.shop, params.id!);
  if (!ct) throw new Response("Not found", { status: 404 });
  return json({ ct });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const name = ((form.get("name") as string) || "").trim();
  if (!name) return json({ errors: { name: "Name is required" } }, { status: 400 });
  const endAtIso = form.get("endAtIso") as string;
  const endAt = new Date(endAtIso);
  if (isNaN(endAt.getTime())) return json({ errors: { endAtIso: "Invalid end date" } }, { status: 400 });
  let styleOverrides: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse((form.get("styleOverrides") as string) || "{}");
    if (Object.keys(parsed).length > 0) styleOverrides = parsed;
  } catch { /* ignore */ }
  const layout = (form.get("layout") as string) || "inline";
  const db = getDb(ctx.cloudflare.env.DB);
  await repo.update(db, session.shop, params.id!, {
    name,
    status: ((form.get("status") as string) || "draft") as "draft" | "active" | "paused",
    endAt,
    headline: (form.get("headline") as string) || "Sale ends in",
    expiredHeadline: (form.get("expiredHeadline") as string) || "This deal has ended",
    layout: ["inline", "bar"].includes(layout) ? layout : "inline",
    styleOverrides: styleOverrides as never,
  });
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect(`/app/countdowns/${params.id!}?saved=${encodeURIComponent(name)}`);
}

export default function CountdownEdit() {
  const { ct } = useLoaderData<typeof loader>();
  useSavedToast();
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  const so = (ct.styleOverrides ?? {}) as Record<string, unknown>;
  const initial: Partial<CountdownFormValues> = {
    name: ct.name,
    status: ct.status as CountdownFormValues["status"],
    endAtIso: new Date(ct.endAt).toISOString().slice(0, 16),
    headline: ct.headline,
    expiredHeadline: ct.expiredHeadline,
    layout: (ct.layout as "inline" | "bar") ?? "inline",
    backgroundColor: typeof so.backgroundColor === "string" ? so.backgroundColor : "",
    textColor: typeof so.textColor === "string" ? so.textColor : "",
    accentColor: typeof so.accentColor === "string" ? so.accentColor : "",
    borderRadius: typeof so.borderRadius === "number" ? String(so.borderRadius) : "",
  };
  const snippet = `<div data-pumper-countdown="${ct.id}"></div>`;
  const [values, setValues] = useState<CountdownFormValues | null>(null);
  return (
    <Page title={ct.name} backAction={{ content: "Countdown timers", url: "/app/countdowns" }}>
      <Layout>
        <Layout.Section>
          <CountdownForm submitLabel="Save changes" initialValues={initial} errors={errors} onValuesChange={setValues} />
          <div style={{ height: 16 }} />
          <EmbedCodeCard plan="free" snippet={snippet} />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          {values && <CountdownPreview values={values} />}
        </Layout.Section>
      </Layout>
    </Page>
  );
}
