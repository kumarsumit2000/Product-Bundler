import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Link,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as bundleRepo from "~/lib/bundles/repo";
import { StatusBadge } from "~/components/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const bundles = await bundleRepo.listByShop(db, session.shop);
  return json({ bundles });
}

function summarizeDiscount(b: {
  discountType: string;
  discountValue: number;
}): string {
  if (b.discountType === "percentage") return `${b.discountValue}% off`;
  if (b.discountType === "flat") return `$${b.discountValue.toFixed(2)} off`;
  return `Fixed $${b.discountValue.toFixed(2)}`;
}

export default function BundlesIndex() {
  const { bundles } = useLoaderData<typeof loader>();

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
    <IndexTable.Row id={b.id} key={b.id} position={i}>
      <IndexTable.Cell>
        <Link
          url={`/app/bundles/${b.id}`}
          monochrome
          removeUnderline
        >
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
          ]}
          selectable={false}
        >
          {rowMarkup}
        </IndexTable>
      </Card>
    </Page>
  );
}
