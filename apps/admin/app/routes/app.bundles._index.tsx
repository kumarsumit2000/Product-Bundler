import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page,
  Card,
  BlockStack,
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
import { getUsage } from "~/lib/billing/usage";
import { UsageBanner } from "~/components/UsageBanner";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useSavedToast } from "~/lib/toast";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  type UsageResult = Awaited<ReturnType<typeof getUsage>>;
  const usageFallback: UsageResult = {
    plan: "free", monthlyOrderCount: 0, lifetimeOrderCount: 0, orderCap: 50,
    isLifetimeCap: true, percentUsed: 0, overOnce: false, resetAt: null,
  };
  const [bundles, usage] = await Promise.all([
    bundleRepo.listByShop(db, session.shop),
    getUsage(db, session.shop).catch((err): UsageResult => {
      console.error("[bundles._index] getUsage failed:", err);
      return usageFallback;
    }),
  ]);
  return json({ bundles, usage });
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

function DeleteRowButton({ id, name, onDelete }: { id: string; name: string; onDelete: (id: string, name: string) => void }) {
  return (
    // Wrap in a div so we can stopPropagation on the native click event,
    // preventing IndexTable.Row's onClick (navigate) from firing.
    <div onClick={(e) => e.stopPropagation()}>
      <Button
        variant="plain"
        tone="critical"
        onClick={() => onDelete(id, name)}
      >
        Delete
      </Button>
    </div>
  );
}

export default function BundlesIndex() {
  const { bundles, usage } = useLoaderData<typeof loader>();
  useSavedToast();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const resourceIDResolver = (b: { id: string }) => b.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(bundles as { id: string }[], { resourceIDResolver });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | "bulk" | null>(null);
  const [inFlight, setInFlight] = useState(false);

  useEffect(() => {
    if (inFlight && fetcher.state === "idle") {
      setDeleteTarget(null);
      setInFlight(false);
    }
  }, [fetcher.state, inFlight]);

  const onRowDelete = (id: string, name: string) => setDeleteTarget({ id, name });
  const onBulkDelete = () => {
    if (selectedResources.length === 0) return;
    setDeleteTarget("bulk");
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    setInFlight(true);
    if (deleteTarget === "bulk") {
      fetcher.submit({ _action: "delete-bulk", ids: JSON.stringify(selectedResources) }, { method: "post" });
      clearSelection();
    } else {
      fetcher.submit({ _action: "delete", id: deleteTarget.id }, { method: "post" });
    }
  };
  const closeModal = () => { if (!inFlight) setDeleteTarget(null); };

  if (bundles.length === 0) {
    return (
      <Page
        title="Bundles"
        primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}
      >
        <BlockStack gap="400">
          <UsageBanner usage={usage} />
          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Text as="h2" variant="headingMd">No bundles yet</Text>
              <Text as="p" tone="subdued">
                Group products together with a discount that applies at checkout.
              </Text>
              <Button variant="primary" url="/app/bundles/new">Create bundle</Button>
            </BlockStack>
          </Card>
        </BlockStack>
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
        <DeleteRowButton id={b.id} name={b.name} onDelete={onRowDelete} />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Bundles"
      primaryAction={{ content: "Create bundle", url: "/app/bundles/new" }}
    >
      <BlockStack gap="400">
        <UsageBanner usage={usage} />
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
              { content: "Delete", onAction: onBulkDelete },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </BlockStack>
      <ConfirmModal
        open={deleteTarget !== null}
        title={deleteTarget === "bulk" ? "Delete bundles?" : `Delete bundle "${deleteTarget?.name ?? ""}"?`}
        body={deleteTarget === "bulk"
          ? `Delete ${selectedResources.length} bundle${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`
          : "This cannot be undone."}
        loading={inFlight}
        onConfirm={confirmDelete}
        onClose={closeModal}
      />
    </Page>
  );
}
