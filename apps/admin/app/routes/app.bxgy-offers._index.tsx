import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Page, Card, BlockStack, IndexTable, Text, Link, Button, useIndexResourceState,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bxgyRepo from "~/lib/bxgy-offers/repo";
import { syncShopConfig } from "~/lib/metafield-sync";
import { StatusBadge } from "~/components/StatusBadge";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useSavedToast } from "~/lib/toast";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const items = await bxgyRepo.listByShop(db, session.shop);
  return json({ items });
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
    await bxgyRepo.deleteById(db, session.shop, id);
  } else if (intent === "delete-bulk") {
    const idsRaw = form.get("ids") as string;
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    for (const id of ids) await bxgyRepo.deleteById(db, session.shop, id);
  } else {
    return json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await syncShopConfig(db, admin, session.shop);
  } catch (err) {
    console.error("[bxgy-offers delete] syncShopConfig failed (non-fatal):", err);
  }
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return json({ ok: true });
}

function DeleteRowButton({ id, name, onDelete }: { id: string; name: string; onDelete: (id: string, name: string) => void }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Button variant="plain" tone="critical" onClick={() => onDelete(id, name)}>
        Delete
      </Button>
    </div>
  );
}

export default function BxgyIndex() {
  const { items } = useLoaderData<typeof loader>();
  useSavedToast();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const resourceIDResolver = (o: { id: string }) => o.id;
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

  if (items.length === 0) {
    return (
      <Page
        title="Buy X, get Y"
        primaryAction={{ content: "Create offer", url: "/app/bxgy-offers/new" }}
      >
        <Card>
          <BlockStack gap="300" inlineAlign="center">
            <Text as="h2" variant="headingMd">No BXGY offers yet</Text>
            <Text as="p" tone="subdued">
              Set up a multi-bar Buy X, get Y offer (e.g. Buy 1 / get 1 free, Buy 2 / get 3 free).
            </Text>
            <Button variant="primary" url="/app/bxgy-offers/new">Create offer</Button>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const rowMarkup = items.map((o, i) => (
    <IndexTable.Row
      id={o.id}
      key={o.id}
      position={i}
      selected={selectedResources.includes(o.id)}
      onClick={() => navigate(`/app/bxgy-offers/${o.id}`)}
    >
      <IndexTable.Cell>
        <Link url={`/app/bxgy-offers/${o.id}`} monochrome removeUnderline>{o.name}</Link>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusBadge status={o.status as "draft" | "active" | "paused"} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {o.bars.length} bar{o.bars.length === 1 ? "" : "s"}
      </IndexTable.Cell>
      <IndexTable.Cell>{new Date(o.updatedAt).toLocaleDateString()}</IndexTable.Cell>
      <IndexTable.Cell>
        <DeleteRowButton id={o.id} name={o.name} onDelete={onRowDelete} />
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Buy X, get Y"
      primaryAction={{ content: "Create offer", url: "/app/bxgy-offers/new" }}
    >
      <Card padding="0">
        <IndexTable
          itemCount={items.length}
          headings={[
            { title: "Name" },
            { title: "Status" },
            { title: "Bars" },
            { title: "Updated" },
            { title: "" },
          ]}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          promotedBulkActions={[{ content: "Delete", onAction: onBulkDelete }]}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
      <ConfirmModal
        open={deleteTarget !== null}
        title={deleteTarget === "bulk" ? "Delete offers?" : `Delete offer "${deleteTarget?.name ?? ""}"?`}
        body={deleteTarget === "bulk"
          ? `Delete ${selectedResources.length} offer${selectedResources.length === 1 ? "" : "s"}? This cannot be undone.`
          : "This cannot be undone."}
        loading={inFlight}
        onConfirm={confirmDelete}
        onClose={() => { if (!inFlight) setDeleteTarget(null); }}
      />
    </Page>
  );
}
