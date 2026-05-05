import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  return json({ shop: session.shop });
}

export default function AppIndex() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Page title="Product Bundler">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Hello, {shop}
          </Text>
          <Text as="p" variant="bodyMd">
            Phase 0 scaffold is working. OAuth complete, session in KV, shop row in D1.
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
