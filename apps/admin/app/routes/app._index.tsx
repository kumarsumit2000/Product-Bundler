import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, MediaCard, BlockStack, Text, Layout } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import { eq } from "drizzle-orm";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: { scopes: session.scope ?? "", uninstalledAt: null },
    });

  return json({ shop: session.shop });
}

export default function Dashboard() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <Page title="Product Bundler">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Welcome, {shop}</Text>
              <Text as="p" variant="bodyMd">
                Get started by creating a bundle or quantity break. Once active, your widgets appear on product pages and discounts apply at checkout.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <MediaCard
            title="Bundles"
            primaryAction={{ content: "View bundles", url: "/app/bundles" }}
            description="Group two or more products together at a discount. Customers see a 'buy together' widget on product pages."
            portrait
          >
            <div style={{ height: 80 }} />
          </MediaCard>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <MediaCard
            title="Quantity Breaks"
            primaryAction={{ content: "View quantity breaks", url: "/app/quantity-breaks" }}
            description="Tiered pricing on a single product. Customers save when they buy more."
            portrait
          >
            <div style={{ height: 80 }} />
          </MediaCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
