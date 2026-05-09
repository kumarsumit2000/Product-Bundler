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
import { useEffect, useRef } from "react";
import { Box } from "@shopify/polaris";
import { ShopifyImagePicker } from "~/components/ShopifyImagePicker";
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

  const trigger = (form.get("popupTrigger") as string) || "delay";
  const imagePos = (form.get("popupImagePosition") as string) || "none";

  const styleRaw = (form.get("styleOverrides") as string) || "{}";
  let styleOverrides: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(styleRaw);
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== undefined && v !== null && v !== "") filtered[k] = v;
    }
    styleOverrides = Object.keys(filtered).length > 0 ? filtered : null;
  } catch { styleOverrides = null; }

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
    popupImageUrl: ((form.get("popupImageUrl") as string) || "").slice(0, 500),
    popupImagePosition: ["none", "top", "bottom", "left", "right"].includes(imagePos) ? imagePos : "none",
    excludedPaths: ((form.get("excludedPaths") as string) || "").slice(0, 2000),
    styleOverrides: styleOverrides as never,
  });

  await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${session.shop}`);
  return redirect("/app/newsletter?saved=Newsletter");
}

function NewsletterLivePreview({ config }: { config: unknown }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSentRef = useRef<string>("");
  const [height, setHeight] = useState<number>(320);

  useEffect(() => {
    const next = JSON.stringify(config);
    if (next === lastSentRef.current) return;
    const handle = setTimeout(() => {
      lastSentRef.current = next;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "pumper:preview", config },
        "*",
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [config]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.body) return;
      const next = Math.max(180, doc.documentElement.scrollHeight || doc.body.scrollHeight);
      setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">Live preview</Text>
        <Text as="p" tone="subdued">This is how the signup widget will render on your storefront.</Text>
        <Box
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          overflowX="hidden"
          overflowY="hidden"
        >
          <iframe
            ref={iframeRef}
            src="/preview/newsletter/default"
            style={{ width: "100%", height: `${height}px`, border: "none", display: "block", background: "#f6f6f7", transition: "height .15s" }}
            title="Newsletter preview"
          />
        </Box>
      </BlockStack>
    </Card>
  );
}

type StyleForm = {
  backgroundColor: string;
  headingColor: string;
  textColor: string;
  buttonBg: string;
  buttonText: string;
  borderColor: string;
  borderRadius: string;
  inlinePaddingX: string;
  inlinePaddingY: string;
  popupPaddingX: string;
  popupPaddingY: string;
  textAlign: string;
  inlineMaxWidth: string;
  popupMaxWidth: string;
};

const EMPTY_STYLE: StyleForm = {
  backgroundColor: "",
  headingColor: "",
  textColor: "",
  buttonBg: "",
  buttonText: "",
  borderColor: "",
  borderRadius: "",
  inlinePaddingX: "",
  inlinePaddingY: "",
  popupPaddingX: "",
  popupPaddingY: "",
  textAlign: "",
  inlineMaxWidth: "",
  popupMaxWidth: "",
};

function styleFromSettings(so: unknown): StyleForm {
  const s = (so ?? {}) as Record<string, unknown>;
  return {
    backgroundColor: typeof s.backgroundColor === "string" ? s.backgroundColor : "",
    headingColor: typeof s.headingColor === "string" ? s.headingColor : "",
    textColor: typeof s.textColor === "string" ? s.textColor : "",
    buttonBg: typeof s.buttonBg === "string" ? s.buttonBg : "",
    buttonText: typeof s.buttonText === "string" ? s.buttonText : "",
    borderColor: typeof s.borderColor === "string" ? s.borderColor : "",
    borderRadius: typeof s.borderRadius === "number" ? String(s.borderRadius) : "",
    inlinePaddingX: typeof s.inlinePaddingX === "number"
      ? String(s.inlinePaddingX)
      : (typeof s.inlinePadding === "number" ? String(s.inlinePadding) : ""),
    inlinePaddingY: typeof s.inlinePaddingY === "number"
      ? String(s.inlinePaddingY)
      : (typeof s.inlinePadding === "number" ? String(s.inlinePadding) : ""),
    popupPaddingX: typeof s.popupPaddingX === "number"
      ? String(s.popupPaddingX)
      : (typeof s.popupPadding === "number" ? String(s.popupPadding) : ""),
    popupPaddingY: typeof s.popupPaddingY === "number"
      ? String(s.popupPaddingY)
      : (typeof s.popupPadding === "number" ? String(s.popupPadding) : ""),
    textAlign: typeof s.textAlign === "string" ? s.textAlign : "",
    inlineMaxWidth: typeof s.inlineMaxWidth === "number" ? String(s.inlineMaxWidth) : "",
    popupMaxWidth: typeof s.popupMaxWidth === "number" ? String(s.popupMaxWidth) : "",
  };
}

function buildStyleOverrides(s: StyleForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.backgroundColor) out.backgroundColor = s.backgroundColor;
  if (s.headingColor) out.headingColor = s.headingColor;
  if (s.textColor) out.textColor = s.textColor;
  if (s.buttonBg) out.buttonBg = s.buttonBg;
  if (s.buttonText) out.buttonText = s.buttonText;
  if (s.borderColor) out.borderColor = s.borderColor;
  if (s.borderRadius) {
    const n = parseInt(s.borderRadius, 10);
    if (Number.isFinite(n)) out.borderRadius = n;
  }
  for (const k of [
    "inlinePaddingX", "inlinePaddingY", "popupPaddingX", "popupPaddingY",
    "inlineMaxWidth", "popupMaxWidth",
  ] as const) {
    if (s[k]) {
      const n = parseInt(s[k], 10);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  if (s.textAlign && ["left", "center", "right"].includes(s.textAlign)) {
    out.textAlign = s.textAlign;
  }
  return out;
}

export default function NewsletterPage() {
  const { settings } = useLoaderData<typeof loader>();
  useSavedToast();
  const [values, setValues] = useState({
    ...settings,
    style: styleFromSettings((settings as { styleOverrides?: unknown }).styleOverrides),
  });
  const setStyle = (patch: Partial<StyleForm>) =>
    setValues((v) => ({ ...v, style: { ...v.style, ...patch } }));

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
      // Always send a popup block so the preview iframe can render the popup
      // styling regardless of whether it's enabled. Enable/trigger only affects
      // the auto-open behavior on the storefront.
      popup: {
        trigger: values.popupTrigger as "delay" | "exit_intent" | "scroll",
        delaySeconds: values.popupDelaySeconds,
        scrollPercent: values.popupScrollPercent,
        frequencyDays: values.popupFrequencyDays,
        imageUrl: values.popupImageUrl || null,
        imagePosition: values.popupImagePosition as "none" | "top" | "bottom" | "left" | "right",
        excludedPaths: [],
      },
      styleOverrides: buildStyleOverrides(values.style),
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

              <NewsletterLivePreview config={previewConfig} />

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
                      <Select
                        label="Image position"
                        name="popupImagePosition"
                        options={[
                          { label: "No image", value: "none" },
                          { label: "Image on left", value: "left" },
                          { label: "Image on right", value: "right" },
                          { label: "Image on top", value: "top" },
                          { label: "Image on bottom", value: "bottom" },
                        ]}
                        value={values.popupImagePosition}
                        onChange={(popupImagePosition) => setValues((v) => ({ ...v, popupImagePosition }))}
                      />
                      {values.popupImagePosition !== "none" && (
                        <BlockStack gap="100">
                          <Text as="span" variant="bodyMd">Image</Text>
                          <ShopifyImagePicker
                            url={values.popupImageUrl}
                            onChange={(popupImageUrl) => setValues((v) => ({ ...v, popupImageUrl }))}
                          />
                          <input type="hidden" name="popupImageUrl" value={values.popupImageUrl} />
                          <Text as="p" tone="subdued" variant="bodySm">
                            Pulls from Shopify admin → Content → Files. Recommended: 800×800px for left/right, 1200×400px for top/bottom.
                          </Text>
                        </BlockStack>
                      )}
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
                  <Text as="h2" variant="headingMd">Appearance</Text>
                  <Text as="p" tone="subdued">
                    Override colors and shape. Leave any field blank to use defaults.
                  </Text>
                  <input
                    type="hidden"
                    name="styleOverrides"
                    value={JSON.stringify(buildStyleOverrides(values.style))}
                  />
                  <FormLayout>
                    <FormLayout.Group>
                      <ColorSwatchPicker
                        label="Background"
                        value={values.style.backgroundColor}
                        onChange={(backgroundColor) => setStyle({ backgroundColor })}
                        placeholder="#FFFFFF"
                      />
                      <ColorSwatchPicker
                        label="Border"
                        value={values.style.borderColor}
                        onChange={(borderColor) => setStyle({ borderColor })}
                        placeholder="#E5E7EB"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <ColorSwatchPicker
                        label="Heading text"
                        value={values.style.headingColor}
                        onChange={(headingColor) => setStyle({ headingColor })}
                        placeholder="#1A1A1A"
                      />
                      <ColorSwatchPicker
                        label="Body text"
                        value={values.style.textColor}
                        onChange={(textColor) => setStyle({ textColor })}
                        placeholder="#666666"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <ColorSwatchPicker
                        label="Button background"
                        value={values.style.buttonBg}
                        onChange={(buttonBg) => setStyle({ buttonBg })}
                        placeholder="#7B1E2A"
                      />
                      <ColorSwatchPicker
                        label="Button text"
                        value={values.style.buttonText}
                        onChange={(buttonText) => setStyle({ buttonText })}
                        placeholder="#FFFFFF"
                      />
                    </FormLayout.Group>
                    <TextField
                      label="Border radius (px)"
                      type="number"
                      value={values.style.borderRadius}
                      onChange={(borderRadius) => setStyle({ borderRadius })}
                      autoComplete="off"
                      min={0}
                      max={48}
                      placeholder="8"
                    />
                    <FormLayout.Group>
                      <Select
                        label="Text alignment"
                        options={[
                          { label: "Left", value: "left" },
                          { label: "Center", value: "center" },
                          { label: "Right", value: "right" },
                          { label: "Default", value: "" },
                        ]}
                        value={values.style.textAlign}
                        onChange={(textAlign) => setStyle({ textAlign })}
                        helpText="Heading + subtitle"
                      />
                    </FormLayout.Group>
                    <FormLayout.Group>
                      <TextField
                        label="Inline max width (px)"
                        type="number"
                        value={values.style.inlineMaxWidth}
                        onChange={(inlineMaxWidth) => setStyle({ inlineMaxWidth })}
                        autoComplete="off"
                        min={200}
                        max={1200}
                        placeholder="full width"
                        helpText="Caps width of the inline embed"
                      />
                      <TextField
                        label="Popup max width (px)"
                        type="number"
                        value={values.style.popupMaxWidth}
                        onChange={(popupMaxWidth) => setStyle({ popupMaxWidth })}
                        autoComplete="off"
                        min={300}
                        max={1200}
                        placeholder="440 (760 with side image)"
                        helpText="Caps width of the popup modal"
                      />
                    </FormLayout.Group>
                    <Text as="h3" variant="headingSm">Inline padding</Text>
                    <FormLayout.Group>
                      <TextField
                        label="Horizontal (px)"
                        type="number"
                        value={values.style.inlinePaddingX}
                        onChange={(inlinePaddingX) => setStyle({ inlinePaddingX })}
                        autoComplete="off"
                        min={0}
                        max={80}
                        placeholder="16"
                        helpText="Left + right"
                      />
                      <TextField
                        label="Vertical (px)"
                        type="number"
                        value={values.style.inlinePaddingY}
                        onChange={(inlinePaddingY) => setStyle({ inlinePaddingY })}
                        autoComplete="off"
                        min={0}
                        max={80}
                        placeholder="16"
                        helpText="Top + bottom"
                      />
                    </FormLayout.Group>
                    <Text as="h3" variant="headingSm">Popup padding</Text>
                    <FormLayout.Group>
                      <TextField
                        label="Horizontal (px)"
                        type="number"
                        value={values.style.popupPaddingX}
                        onChange={(popupPaddingX) => setStyle({ popupPaddingX })}
                        autoComplete="off"
                        min={0}
                        max={80}
                        placeholder="28"
                        helpText="Left + right"
                      />
                      <TextField
                        label="Vertical (px)"
                        type="number"
                        value={values.style.popupPaddingY}
                        onChange={(popupPaddingY) => setStyle({ popupPaddingY })}
                        autoComplete="off"
                        min={0}
                        max={80}
                        placeholder="32"
                        helpText="Top + bottom"
                      />
                    </FormLayout.Group>
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

              <EmbedCodeCard plan="free" snippet={`<div data-pumper-newsletter></div>`} />

              <InlineStack align="end">
                <Button submit variant="primary">Save</Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
