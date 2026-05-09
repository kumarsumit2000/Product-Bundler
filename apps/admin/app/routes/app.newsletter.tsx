import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page, Layout, Card, BlockStack, FormLayout, TextField, Checkbox, Button, Text, Banner, InlineStack,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/newsletter/repo";
import { useSavedToast } from "~/lib/toast";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";

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
    headline: ((form.get("headline") as string) || "").slice(0, 100),
    subtitle: ((form.get("subtitle") as string) || "").slice(0, 200),
    placeholder: ((form.get("placeholder") as string) || "you@email.com").slice(0, 50),
    ctaLabel: ((form.get("ctaLabel") as string) || "Subscribe").slice(0, 30),
    successMessage: ((form.get("successMessage") as string) || "Thanks!").slice(0, 200),
    tags: ((form.get("tags") as string) || "newsletter,prospect").slice(0, 100),
  });

  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect("/app/newsletter?saved=Newsletter");
}

export default function NewsletterPage() {
  const { settings } = useLoaderData<typeof loader>();
  useSavedToast();
  const [values, setValues] = useState(settings);

  return (
    <Page title="Newsletter signup" backAction={{ content: "Back", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Form method="post">
            <BlockStack gap="400">
              <Banner tone="info">
                Emails captured here are saved as Shopify customers with email
                marketing consent — directly inside your store. We don&apos;t
                store any email addresses on our servers.
              </Banner>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Status</Text>
                  <Checkbox
                    label="Show newsletter signup on storefront"
                    name="enabled"
                    checked={values.enabled}
                    onChange={(enabled) => setValues((v) => ({ ...v, enabled }))}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Copy</Text>
                  <FormLayout>
                    <TextField
                      label="Headline"
                      name="headline"
                      value={values.headline}
                      onChange={(headline) => setValues((v) => ({ ...v, headline }))}
                      autoComplete="off"
                      maxLength={100}
                      showCharacterCount
                    />
                    <TextField
                      label="Subtitle"
                      name="subtitle"
                      value={values.subtitle}
                      onChange={(subtitle) => setValues((v) => ({ ...v, subtitle }))}
                      autoComplete="off"
                      maxLength={200}
                      showCharacterCount
                      multiline={2}
                    />
                    <TextField
                      label="Email placeholder"
                      name="placeholder"
                      value={values.placeholder}
                      onChange={(placeholder) => setValues((v) => ({ ...v, placeholder }))}
                      autoComplete="off"
                      maxLength={50}
                    />
                    <TextField
                      label="Button text"
                      name="ctaLabel"
                      value={values.ctaLabel}
                      onChange={(ctaLabel) => setValues((v) => ({ ...v, ctaLabel }))}
                      autoComplete="off"
                      maxLength={30}
                    />
                    <TextField
                      label="Success message"
                      name="successMessage"
                      value={values.successMessage}
                      onChange={(successMessage) => setValues((v) => ({ ...v, successMessage }))}
                      autoComplete="off"
                      maxLength={200}
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Customer tags</Text>
                  <Text as="p" tone="subdued">
                    Comma-separated tags applied to each Shopify customer created via this form.
                  </Text>
                  <TextField
                    label="Tags"
                    labelHidden
                    name="tags"
                    value={values.tags}
                    onChange={(tags) => setValues((v) => ({ ...v, tags }))}
                    autoComplete="off"
                    maxLength={100}
                    helpText="e.g. newsletter,prospect"
                  />
                </BlockStack>
              </Card>

              <InlineStack align="end">
                <Button submit variant="primary">Save</Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <EmbedCodeCard plan="free" snippet={`<div data-pumper-newsletter></div>`} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
