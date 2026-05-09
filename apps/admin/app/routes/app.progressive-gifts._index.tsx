import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Card, BlockStack, IndexTable, Text, Link, Button } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/progressive-gifts/repo";
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
  } else {
    return json({ error: "Invalid action" }, { status: 400 });
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return json({ ok: true });
}

export default function ProgressiveGiftsIndex() {
  const { items } = useLoaderData<typeof loader>();
  useSavedToast();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <Page
        title="Progressive gifts"
        primaryAction={{ content: "Create progressive gift", url: "/app/progressive-gifts/new" }}
        backAction={{ content: "Back", url: "/app" }}
      >
        <Card>
          <BlockStack gap="300" inlineAlign="center">
            <Text as="h2" variant="headingMd">No progressive gifts yet</Text>
            <Text as="p" tone="subdued">
              Reward customers with free gifts as their cart total grows.
            </Text>
            <Button variant="primary" url="/app/progressive-gifts/new">Create progressive gift</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const rowMarkup = items.map((p, i) => (
    <IndexTable.Row
      id={p.id}
      key={p.id}
      position={i}
      onClick={() => navigate(`/app/progressive-gifts/${p.id}`)}
    >
      <IndexTable.Cell>
        <Link url={`/app/progressive-gifts/${p.id}`} monochrome removeUnderline>{p.name}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={p.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {p.thresholds.length} threshold{p.thresholds.length === 1 ? "" : "s"}
      </IndexTable.Cell>
      <IndexTable.Cell>{new Date(p.updatedAt).toLocaleDateString()}</IndexTable.Cell>
      <IndexTable.Cell>
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            variant="plain"
            tone="critical"
            onClick={() => fetcher.submit({ _action: "delete", id: p.id }, { method: "post" })}
          >
            Delete
          </Button>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Progressive gifts"
      primaryAction={{ content: "Create progressive gift", url: "/app/progressive-gifts/new" }}
      backAction={{ content: "Back", url: "/app" }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={items.length}
          headings={[
            { title: "Name" }, { title: "Status" }, { title: "Thresholds" }, { title: "Updated" }, { title: "" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
