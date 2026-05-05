import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { Page, Card, FormLayout, TextField, Button, BlockStack } from "@shopify/polaris";
import { useState } from "react";
import { createShopifyApp, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const shopify = createShopifyApp(context as AppLoadContext);
  await shopify.login(request);
  return { polarisTranslations: {} };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const shopify = createShopifyApp(context as AppLoadContext);
  return shopify.login(request);
}

export default function Login() {
  useLoaderData<typeof loader>();
  const [shop, setShop] = useState("");
  return (
    <Page title="Login">
      <Card>
        <Form method="post">
          <BlockStack gap="400">
            <FormLayout>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
              />
              <Button submit variant="primary">
                Log in
              </Button>
            </FormLayout>
          </BlockStack>
        </Form>
      </Card>
    </Page>
  );
}
