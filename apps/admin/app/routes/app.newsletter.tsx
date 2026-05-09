import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page, Layout, Card, BlockStack, FormLayout, TextField, Checkbox, Select, Button, Text, Banner, InlineStack,
} from "@shopify/polaris";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb } from "~/db.server";
import * as repo from "~/lib/newsletter/repo";
import { useSavedToast } from "~/lib/toast";
import { EmbedCodeCard } from "~/components/EmbedCodeCard";
import { PreviewPane } from "~/components/PreviewPane";

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

  const trigger = (form.get("popupTrigger") as string) || "delay";
  await repo.upsert(db, session.shop, {
    enabled: form.get("enabled") === "on",
    headline: ((form.get("headline") as string) || "").slice(0, 100),
    subtitle: ((form.get("subtitle") as string) || "").slice(0, 200),
    placeholder: ((form.get("placeholder") as string) || "you@email.com").slice(0, 50),
    ctaLabel: ((form.get("ctaLabel") as string) || "Subscribe").slice(0, 30),
    successMessage: ((form.get("successMessage") as string) || "Thanks!").slice(0, 200),
    tags: ((form.get("tags") as string) || "newsletter,prospect").slice(0, 100),
    popupEnabled: form.get("popupEnabled") === "on",
    popupTrigger: ["delay", "exit_intent", "scroll"].includes(trigger) ? trigger : "delay",
    popupDelaySeconds: Math.max(0, Math.min(120, parseInt((form.get("popupDelaySeconds") as string) || "5", 10) || 5)),
    popupScrollPercent: Math.max(10, Math.min(100, parseInt((form.get("popupScrollPercent") as string) || "50", 10) || 50)),
    popupFrequencyDays: Math.max(0, Math.min(365, parseInt((form.get("popupFrequencyDays") as string) || "7", 10) || 7)),
    excludedPaths: ((form.get("excludedPaths") as string) || "").slice(0, 2000),
  });

  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect("/app/newsletter?saved=Newsletter");
}

export default function NewsletterPage() {
  const { settings } = useLoaderData<typeof loader>();
  useSavedToast();
  const [values, setValues] = useState(settings);

  const previewConfig = {
    shop: "preview",
    settings: {
      primaryColor: "#7B1E2A", textColor: "#1A1A1A", backgroundColor: "#FFFFFF",
      borderRadius: 8, fontFamily: "inherit",
      bundleHeadline: "Frequently bought together", qbHeadline: "Choose your savings",
      showCompareAtPrice: true, currency: "USD", locale: "en",
    },
    bundles: [],
    quantityBreaks: [],
    newsletter: {
      headline: values.headline,
      subtitle: values.subtitle,
      placeholder: values.placeholder,
      ctaLabel: values.ctaLabel,
      successMessage: values.successMessage,
      tags: values.tags,
      // Popup is intentionally omitted in preview — the iframe just renders
      // the inline form so the merchant can see the copy + styling.
      popup: null,
    },
  };

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
                  <Text as="h2" variant="headingMd">Popup display</Text>
                  <Text as="p" tone="subdued">
                    Show the signup form as a centered popup. Otherwise it only renders inline
                    where you paste the embed snippet.
                  </Text>
                  <Checkbox
                    label="Show as popup on storefront"
                    name="popupEnabled"
                    checked={values.popupEnabled}
                    onChange={(popupEnabled) => setValues((v) => ({ ...v, popupEnabled }))}
                  />
                  {values.popupEnabled && (
                    <FormLayout>
                      <Select
                        label="When to open"
                        name="popupTrigger"
                        options={[
                          { label: "After a delay", value: "delay" },
                          { label: "When the visitor scrolls", value: "scroll" },
                          { label: "On exit intent (mouse leaves window)", value: "exit_intent" },
                        ]}
                        value={values.popupTrigger}
                        onChange={(popupTrigger) => setValues((v) => ({ ...v, popupTrigger }))}
                      />
                      {values.popupTrigger === "delay" && (
                        <TextField
                          label="Delay (seconds)"
                          type="number"
                          name="popupDelaySeconds"
                          value={String(values.popupDelaySeconds)}
                          onChange={(s) => setValues((v) => ({ ...v, popupDelaySeconds: parseInt(s, 10) || 0 }))}
                          autoComplete="off"
                          min={0}
                          max={120}
                        />
                      )}
                      {values.popupTrigger === "scroll" && (
                        <TextField
                          label="Show after scrolling (%)"
                          type="number"
                          name="popupScrollPercent"
                          value={String(values.popupScrollPercent)}
                          onChange={(s) => setValues((v) => ({ ...v, popupScrollPercent: parseInt(s, 10) || 0 }))}
                          autoComplete="off"
                          min={10}
                          max={100}
                        />
                      )}
                      <TextField
                        label="Don't show again for (days)"
                        type="number"
                        name="popupFrequencyDays"
                        value={String(values.popupFrequencyDays)}
                        onChange={(s) => setValues((v) => ({ ...v, popupFrequencyDays: parseInt(s, 10) || 0 }))}
                        autoComplete="off"
                        min={0}
                        max={365}
                        helpText="0 = show on every page load"
                      />
                      <TextField
                        label="Hide popup on these pages"
                        name="excludedPaths"
                        value={values.excludedPaths}
                        onChange={(excludedPaths) => setValues((v) => ({ ...v, excludedPaths }))}
                        autoComplete="off"
                        multiline={4}
                        helpText="One path per line. Use * as a wildcard. Examples: /cart, /checkout/*, /pages/contact"
                        placeholder={`/cart\n/checkout/*\n/pages/contact`}
                      />
                    </FormLayout>
                  )}
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
          <BlockStack gap="400">
            <PreviewPane type="newsletter" id="default" config={previewConfig} />
            <EmbedCodeCard plan="free" snippet={`<div data-pumper-newsletter></div>`} />
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
