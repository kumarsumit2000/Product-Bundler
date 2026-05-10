import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useActionData } from "@remix-run/react";
import { Page, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/countdowns/repo";
import { CountdownForm } from "~/components/CountdownForm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
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
  const created = await repo.create(db, session.shop, {
    name,
    status: ((form.get("status") as string) || "draft") as "draft" | "active" | "paused",
    endAt,
    headline: (form.get("headline") as string) || "Sale ends in",
    expiredHeadline: (form.get("expiredHeadline") as string) || "This deal has ended",
    layout: ["inline", "bar"].includes(layout) ? layout : "inline",
    styleOverrides: styleOverrides as never,
  });
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect(`/app/countdowns/${created.id}?saved=${encodeURIComponent(name)}`);
}

export default function CountdownNew() {
  const actionData = useActionData<typeof action>();
  const errors = actionData && "errors" in actionData ? actionData.errors : undefined;
  return (
    <Page title="Create countdown timer" backAction={{ content: "Countdown timers", url: "/app/countdowns" }}>
      <Layout>
        <Layout.Section>
          <CountdownForm submitLabel="Save timer" errors={errors} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
