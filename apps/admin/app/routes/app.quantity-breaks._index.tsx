import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Link,
  Button,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { StatusBadge } from "~/components/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const items = await qbRepo.listByShop(db, session.shop);
  return json({ items });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const intent = form.get("_action") as string;
  const id = form.get("id") as string;

  if (intent !== "delete" || !id) {
    return json({ error: "Invalid action" }, { status: 400 });
  }

  const db = getDb(ctx.cloudflare.env.DB);
  await qbRepo.deleteById(db, session.shop, id);
  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);

  return redirect("/app/quantity-breaks");
}

function DeleteRowButton({ id, name }: { id: string; name: string }) {
  const fetcher = useFetcher();
  const isDeleting = fetcher.state !== "idle";

  return (
    <Button
      variant="plain"
      tone="critical"
      loading={isDeleting}
      onClick={() => {
        if (confirm(`Delete quantity break "${name}"? This cannot be undone.`)) {
          fetcher.submit({ _action: "delete", id }, { method: "post" });
        }
      }}
    >
      Delete
    </Button>
  );
}

export default function QbsIndex() {
  const { items } = useLoaderData<typeof loader>();

  if (items.length === 0) {
    return (
      <Page
        title="Quantity Breaks"
        primaryAction={{
          content: "Create quantity break",
          url: "/app/quantity-breaks/new",
        }}
      >
        <Card>
          <EmptyState
            heading="No quantity breaks yet"
            action={{
              content: "Create quantity break",
              url: "/app/quantity-breaks/new",
            }}
            image=""
          >
            <Text as="p">
              Set tiered pricing on a single product so customers save when
              they buy more.
            </Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rowMarkup = items.map((q, i) => (
    <IndexTable.Row id={q.id} key={q.id} position={i}>
      <IndexTable.Cell>
        <Link url={`/app/quantity-breaks/${q.id}`} monochrome removeUnderline>
          {q.name}
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={q.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {q.tiers.length} tier{q.tiers.length === 1 ? "" : "s"}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(q.updatedAt).toLocaleDateString()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <DeleteRowButton id={q.id} name={q.name} />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Quantity Breaks"
      primaryAction={{
        content: "Create quantity break",
        url: "/app/quantity-breaks/new",
      }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={items.length}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Tiers" },
            { title: "Updated" },
            { title: "" },
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
