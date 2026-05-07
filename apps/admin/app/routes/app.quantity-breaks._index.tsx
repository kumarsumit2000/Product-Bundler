import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Link,
  Button,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as qbRepo from "~/lib/quantity-breaks/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { StatusBadge } from "~/components/StatusBadge";
import { getUsage } from "~/lib/billing/usage";
import { UsageBanner } from "~/components/UsageBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  type UsageResult = Awaited<ReturnType<typeof getUsage>>;
  const usageFallback: UsageResult = {
    plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 0, orderCap: 50,
    isLifetimeCap: true, percentUsed: 0, overOnce: false, resetAt: null,
  };
  const [items, usage] = await Promise.all([
    qbRepo.listByShop(db, session.shop),
    getUsage(db, session.shop).catch((err): UsageResult => {
      console.error("[qb._index] getUsage failed:", err);
      return usageFallback;
    }),
  ]);
  return json({ items, usage });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session, admin } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const intent = form.get("_action") as string;
  const db = getDb(ctx.cloudflare.env.DB);

  if (intent === "delete") {
    const id = form.get("id") as string;
    if (!id) return json({ error: "Missing id" }, { status: 400 });
    await qbRepo.deleteById(db, session.shop, id);
  } else if (intent === "delete-bulk") {
    const idsRaw = form.get("ids") as string;
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    if (ids.length === 0) return json({ error: "No ids" }, { status: 400 });
    for (const id of ids) {
      await qbRepo.deleteById(db, session.shop, id);
    }
  } else {
    return json({ error: "Invalid action" }, { status: 400 });
  }

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
  const { items, usage } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const resourceIDResolver = (q: { id: string }) => q.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(items as { id: string }[], { resourceIDResolver });

  const bulkDelete = () => {
    if (selectedResources.length === 0) return;
    if (
      confirm(
        `Delete ${selectedResources.length} quantity break${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      fetcher.submit(
        { _action: "delete-bulk", ids: JSON.stringify(selectedResources) },
        { method: "post" },
      );
      clearSelection();
    }
  };

  if (items.length === 0) {
    return (
      <Page
        title="Quantity Breaks"
        primaryAction={{
          content: "Create quantity break",
          url: "/app/quantity-breaks/new",
        }}
      >
        <UsageBanner usage={usage} />
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
    <IndexTable.Row
      id={q.id}
      key={q.id}
      position={i}
      selected={selectedResources.includes(q.id)}
      onClick={() => navigate(`/app/quantity-breaks/${q.id}`)}
    >
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
      <UsageBanner usage={usage} />
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
          selectedItemsCount={
            allResourcesSelected ? "All" : selectedResources.length
          }
          onSelectionChange={handleSelectionChange}
          promotedBulkActions={[
            { content: "Delete", onAction: bulkDelete },
          ]}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
