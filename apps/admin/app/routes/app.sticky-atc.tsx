import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page, Layout, Card, BlockStack, FormLayout, TextField, Checkbox, Button, Text, Banner, InlineStack,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/sticky-atc/repo";
import { useSavedToast } from "~/lib/toast";
import { ColorSwatchPicker } from "~/components/ColorSwatchPicker";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const db = getDb(ctx.cloudflare.env.DB);
  const settings = await repo.getOrDefault(db, session.shop);
  return json({ settings });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  const form = await request.formData();
  const db = getDb(ctx.cloudflare.env.DB);

  await repo.upsert(db, session.shop, {
    enabled: form.get("enabled") === "on",
    showImage: form.get("showImage") === "on",
    showQty: form.get("showQty") === "on",
    showPrice: form.get("showPrice") === "on",
    ctaLabel: ((form.get("ctaLabel") as string) || "Add to cart").slice(0, 30),
    backgroundColor: ((form.get("backgroundColor") as string) || "#FFFFFF").slice(0, 16),
    textColor: ((form.get("textColor") as string) || "#1A1A1A").slice(0, 16),
    buttonBg: ((form.get("buttonBg") as string) || "#1A1A1A").slice(0, 16),
    buttonText: ((form.get("buttonText") as string) || "#FFFFFF").slice(0, 16),
  });
  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect("/app/sticky-atc?saved=Sticky+ATC");
}

export default function StickyAtcPage() {
  const { settings } = useLoaderData<typeof loader>();
  useSavedToast();
  const [v, setV] = useState(settings);
  return (
    <Page title="Sticky add to cart" backAction={{ content: "Back", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Form method="post">
            <BlockStack gap="400">
              <Banner tone="info">
                When enabled, a fixed bar appears at the bottom of every product page once the
                customer scrolls past the original Add to cart button. Clicking the bar submits
                the page&apos;s native add-to-cart form so it works with any theme.
              </Banner>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Status</Text>
                  <Checkbox
                    label="Show sticky add-to-cart bar on product pages"
                    name="enabled"
                    checked={v.enabled}
                    onChange={(enabled) => setV((s) => ({ ...s, enabled }))}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Display</Text>
                  <Checkbox
                    label="Show product image"
                    name="showImage"
                    checked={v.showImage}
                    onChange={(showImage) => setV((s) => ({ ...s, showImage }))}
                  />
                  <Checkbox
                    label="Show quantity selector"
                    name="showQty"
                    checked={v.showQty}
                    onChange={(showQty) => setV((s) => ({ ...s, showQty }))}
                  />
                  <Checkbox
                    label="Show price"
                    name="showPrice"
                    checked={v.showPrice}
                    onChange={(showPrice) => setV((s) => ({ ...s, showPrice }))}
                  />
                  <FormLayout>
                    <TextField
                      label="Button text"
                      name="ctaLabel"
                      value={v.ctaLabel}
                      onChange={(ctaLabel) => setV((s) => ({ ...s, ctaLabel }))}
                      autoComplete="off"
                      maxLength={30}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Appearance</Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <ColorSwatchPicker
                        label="Background"
                        value={v.backgroundColor}
                        onChange={(backgroundColor) => setV((s) => ({ ...s, backgroundColor }))}
                        placeholder="#FFFFFF"
                      />
                      <ColorSwatchPicker
                        label="Text"
                        value={v.textColor}
                        onChange={(textColor) => setV((s) => ({ ...s, textColor }))}
                        placeholder="#1A1A1A"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <ColorSwatchPicker
                        label="Button background"
                        value={v.buttonBg}
                        onChange={(buttonBg) => setV((s) => ({ ...s, buttonBg }))}
                        placeholder="#1A1A1A"
                      />
                      <ColorSwatchPicker
                        label="Button text"
                        value={v.buttonText}
                        onChange={(buttonText) => setV((s) => ({ ...s, buttonText }))}
                        placeholder="#FFFFFF"
                      />
                    </FormLayout.Group>
                  </FormLayout>
                  <input type="hidden" name="backgroundColor" value={v.backgroundColor} />
                  <input type="hidden" name="textColor" value={v.textColor} />
                  <input type="hidden" name="buttonBg" value={v.buttonBg} />
                  <input type="hidden" name="buttonText" value={v.buttonText} />
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary" size="large">Save</Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
