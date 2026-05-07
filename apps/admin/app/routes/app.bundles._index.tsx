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
import * as bundleRepo from "~/lib/bundles/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { StatusBadge } from "~/components/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundles = await bundleRepo.listByShop(db, session.shop);
  return json({ bundles });
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
    await bundleRepo.deleteById(db, session.shop, id);
  } else if (intent === "delete-bulk") {
    const idsRaw = form.get("ids") as string;
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    if (ids.length === 0) return json({ error: "No ids" }, { status: 400 });
    for (const id of ids) {
      await bundleRepo.deleteById(db, session.shop, id);
    }
  } else {
    return json({ error: "Invalid action" }, { status: 400 });
  }

  await syncShopConfig(db, admin, session.shop);
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect("/app/bundles");
}

function summarizeDiscount(b: {
  discountType: string;
  discountValue: number;
}): string {
  if (b.discountType === "percentage") return `${b.discountValue}% off`;
  if (b.discountType === "flat") return `$${b.discountValue.toFixed(2)} off`;
  return `Fixed $${b.discountValue.toFixed(2)}`;
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
        if (confirm(`Delete bundle "${name}"? This cannot be undone.`)) {
          fetcher.submit({ _action: "delete", id }, { method: "post" });
        }
      }}
    >
      Delete
    </Button>
  );
}

export default function BundlesIndex() {
  const { bundles } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const resourceIDResolver = (b: { id: string }) => b.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(bundles as { id: string }[], { resourceIDResolver });

  const bulkDelete = () => {
    if (selectedResources.length === 0) return;
    if (
      confirm(
        `Delete ${selectedResources.length} bundle${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      fetcher.submit(
        { _action: "delete-bulk", ids: JSON.stringify(selectedResources) },
        { method: "post" },
      );
      clearSelection();
    }
  };

  if (bundles.length === 0) {
    return (
      <Page
        title="Bundles"
        primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}
      >
        <Card>
          <EmptyState
            heading="No bundles yet"
            action={{ content: "Create bundle", url: "/app/bundles/new" }}
            image=""
          >
            <Text as="p">
              Group products together with a discount that applies at checkout.
            </Text>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const rowMarkup = bundles.map((b, i) => (
    <IndexTable.Row
      id={b.id}
      key={b.id}
      position={i}
      selected={selectedResources.includes(b.id)}
      onClick={() => navigate(`/app/bundles/${b.id}`)}
    >
      <IndexTable.Cell>
        <Link url={`/app/bundles/${b.id}`} monochrome removeUnderline>
          {b.name}
        </Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={b.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>{summarizeDiscount(b)}</IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(b.updatedAt).toLocaleDateString()}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <DeleteRowButton id={b.id} name={b.name} />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Bundles"
      primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={bundles.length}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Discount" },
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
