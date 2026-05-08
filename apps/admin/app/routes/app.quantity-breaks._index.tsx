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
import * as qbRepo from "~/lib/quantity-breaks/repo";
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

export default function QbsIndex() {
  const { items, usage } = useLoaderData<typeof loader>();
  useSavedToast();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const resourceIDResolver = (q: { id: string }) => q.id;
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(items as { id: string }[], { resourceIDResolver });

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

  if (items.length === 0) {
    return (
      <Page
        title="Quantity Breaks"
        primaryAction={{
          content: "Create quantity break",
          url: "/app/quantity-breaks/new",
        }}
      >
        <BlockStack gap="400">
          <UsageBanner usage={usage} />
          <Card>
            <BlockStack gap="300" inlineAlign="center">
              <Text as="h2" variant="headingMd">No quantity breaks yet</Text>
              <Text as="p" tone="subdued">
                Set tiered pricing on a single product so customers save when they buy more.
              </Text>
              <Button variant="primary" url="/app/quantity-breaks/new">Create quantity break</Button>
            </BlockStack>
          </Card>
        </BlockStack>
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
        <DeleteRowButton id={q.id} name={q.name} onDelete={onRowDelete} />
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
      <BlockStack gap="400">
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
              { content: "Delete", onAction: onBulkDelete },
            ]}
          >
            {rowMarkup}
          </IndexTable>
        </Card>
      </BlockStack>
      <ConfirmModal
        open={deleteTarget !== null}
        title={deleteTarget === "bulk" ? "Delete quantity breaks?" : `Delete quantity break "${deleteTarget?.name ?? ""}"?`}
        body={deleteTarget === "bulk"
          ? `Delete ${selectedResources.length} quantity break${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`
          : "This cannot be undone."}
        loading={inFlight}
        onConfirm={confirmDelete}
        onClose={closeModal}
      />
    </Page>
  );
}
