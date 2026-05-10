import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Card, BlockStack, IndexTable, Text, Link, Button } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/countdowns/repo";
import { StatusBadge } from "~/components/StatusBadge";
import { useSavedToast } from "~/lib/toast";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const items = await repo.listByShop(db, session.shop);
  return json({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const intent = form.get("_action") as string;
  const db = getDb(ctx.cloudflare.env.DB);
  if (intent === "delete") {
    const id = form.get("id") as string;
    if (!id) return json({ error: "Missing id" }, { status: 400 });
    await repo.deleteById(db, session.shop, id);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return json({ ok: true });
}

export default function CountdownsIndex() {
  const { items } = useLoaderData<typeof loader>();
  useSavedToast();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <Page
        title="Countdown timers"
        primaryAction={{ content: "Create timer", url: "/app/countdowns/new" }}
        backAction={{ content: "Back", url: "/app" }}
      >
        <Card>
          <BlockStack gap="300" inlineAlign="center">
            <Text as="h2" variant="headingMd">No countdown timers yet</Text>
            <Text as="p" tone="subdued">Create urgency with a ticking deadline.</Text>
            <Button variant="primary" url="/app/countdowns/new">Create timer</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const rows = items.map((c, i) => (
    <IndexTable.Row id={c.id} key={c.id} position={i} onClick={() => navigate(`/app/countdowns/${c.id}`)}>
      <IndexTable.Cell><Link url={`/app/countdowns/${c.id}`} monochrome removeUnderline>{c.name}</Link></IndexTable.Cell>
      <IndexTable.Cell><StatusBadge status={c.status as "draft" | "active" | "paused"} /></IndexTable.Cell>
      <IndexTable.Cell>{new Date(c.endAt).toLocaleString()}</IndexTable.Cell>
      <IndexTable.Cell>
        <div onClick={(e) => e.stopPropagation()}>
          <Button variant="plain" tone="critical" onClick={() => fetcher.submit({ _action: "delete", id: c.id }, { method: "post" })}>Delete</Button>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Countdown timers"
      primaryAction={{ content: "Create timer", url: "/app/countdowns/new" }}
      backAction={{ content: "Back", url: "/app" }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={items.length}
          headings={[{ title: "Name" }, { title: "Status" }, { title: "Ends at" }, { title: "" }]}
          selectable={false}
        >
          {rows}
        </IndexTable>
      </Card>
    </Page>
  );
}
