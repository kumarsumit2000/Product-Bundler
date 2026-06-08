import { useEffect, useState, useCallback } from "react";
import { Banner, BlockStack, Text, Button, InlineStack, Spinner } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

// App-embed activation banner driven by App Bridge's official extension-
// status API (`shopify.app.extensions()`). This replaces the brittle
// settings_data.json parse with a single direct query — Shopify tells us
// exactly whether our embed is active on the published theme.
//
// Returned data shape (per Shopify docs):
//   [{
//     handle: '<extension-handle>',
//     type: 'theme_app_extension',
//     activations: [{
//       target: 'head' | 'body' | 'section' | 'compliance_head',
//       handle: '<block-handle>',          // 'app-embed' for our embed
//       name: '...',
//       status: 'active' | 'available' | 'unavailable',
//       activations: [...]
//     }]
//   }]
//
// We need the activation whose `target === 'head'` and
// `handle === 'app-embed'`. Status 'active' = enabled on the published
// theme; anything else (or absence) means the merchant hasn't flipped
// the toggle (or didn't click Save in the theme editor).

type Status = "loading" | "enabled" | "disabled" | "error";

// Shopify-side type — `shopify.app.extensions()` returns the shape
// below per `app-api` docs. We loosen the typing because App Bridge's
// public typings are sparse and we want this to keep compiling if
// they add new fields.
type ThemeBlockActivation = {
  target?: string;
  handle?: string;
  name?: string;
  status?: string;
};
type ExtensionInfo = {
  handle?: string;
  type?: string;
  activations?: ThemeBlockActivation[];
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppBridge = any;

const EMBED_BLOCK_HANDLE = "app-embed";

async function fetchEmbedStatus(shopify: AppBridge): Promise<Status> {
  try {
    if (!shopify?.app?.extensions) return "error";
    const extensions: ExtensionInfo[] = await shopify.app.extensions();
    // Find any theme-app-extension that has an 'app-embed' head block.
    // An app can register multiple theme extensions; we accept the
    // first matching activation. Status 'active' = enabled.
    for (const ext of extensions) {
      if (ext.type !== "theme_app_extension") continue;
      const acts = ext.activations ?? [];
      for (const act of acts) {
        if (act.target === "head" && act.handle === EMBED_BLOCK_HANDLE) {
          return act.status === "active" ? "enabled" : "disabled";
        }
      }
    }
    // No matching activation found at all — embed exists in the app
    // but isn't even advertised by the published theme (rare; usually
    // means the app was uninstalled / theme isn't 2.0).
    return "disabled";
  } catch {
    return "error";
  }
}

export function AppEmbedStatusBanner({
  shopDomain,
  themeId,
}: {
  shopDomain: string;
  // Numeric Shopify theme id from the dashboard loader. Used to build
  // the deep-link URL. Falls back to "current" if not provided.
  themeId?: string | null;
}) {
  const shopify = useAppBridge();
  const [status, setStatus] = useState<Status>("loading");

  const check = useCallback(() => {
    setStatus("loading");
    void fetchEmbedStatus(shopify).then(setStatus);
  }, [shopify]);

  useEffect(() => {
    void check();
  }, [check]);

  // admin.shopify.com blocks iframe rendering, so opening any admin URL
  // from inside an embedded app means breaking out of every frame to
  // the topmost browsing context.
  const openTop = useCallback((url: string) => {
    if (typeof window === "undefined") return;
    try {
      (window.top ?? window).location.href = url;
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }, []);

  // activateAppId is `{api_key}/{block_handle}` URL-encoded — the
  // Shopify-documented format. api_key is the client_id (not the
  // extension UUID). myshopify.com → admin.shopify.com redirect
  // preserves the param; admin.shopify.com strips it directly.
  const APP_CLIENT_ID = "5d79beeba3a18a8232164a38b3a5602d";
  const themePart = themeId && /^\d+$/.test(themeId) ? themeId : "current";
  const activateUrl = `https://${shopDomain}/admin/themes/${themePart}/editor?context=apps&template=index&activateAppId=${encodeURIComponent(
    `${APP_CLIENT_ID}/${EMBED_BLOCK_HANDLE}`,
  )}`;
  const manualEditorUrl = `https://${shopDomain}/admin/themes/${themePart}/editor?context=apps`;

  if (status === "loading") {
    return (
      <Banner tone="info" title="Checking Bundler activation…">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" />
            <Text as="span">One moment while we check your theme.</Text>
          </InlineStack>
        </BlockStack>
      </Banner>
    );
  }

  if (status === "enabled") {
    return (
      <Banner tone="success" title="Bundler is active on your storefront">
        <BlockStack gap="200">
          <Text as="p">
            Popups, signup forms, bundles, quantity breaks, BXGY — all widgets
            will render normally on your active theme.
          </Text>
          <InlineStack gap="200">
            <Button onClick={() => openTop(manualEditorUrl)}>Open theme editor</Button>
            <Button onClick={check} variant="plain">Re-check</Button>
          </InlineStack>
        </BlockStack>
      </Banner>
    );
  }

  if (status === "error") {
    return (
      <Banner tone="info" title="Could not verify Bundler activation">
        <BlockStack gap="200">
          <Text as="p">
            We couldn't reach Shopify's extension-status API just now. Open
            the theme editor and confirm the Bundler app embed is toggled on,
            or click Re-check to try again.
          </Text>
          <InlineStack gap="200">
            <Button onClick={() => openTop(activateUrl)} variant="primary">Open theme editor</Button>
            <Button onClick={check}>Re-check</Button>
          </InlineStack>
        </BlockStack>
      </Banner>
    );
  }

  // disabled
  return (
    <Banner tone="warning" title="Action needed — enable Bundler on your theme">
      <BlockStack gap="200">
        <Text as="p">
          The Bundler app embed is not active on your published theme. Without it,
          popups, signup forms, and product widgets will not appear on your
          storefront — even though everything is configured in this admin.
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Click <strong>Enable Bundler</strong> to open the theme editor with
          the right panel pre-selected. Toggle it on, click the dark{" "}
          <strong>Save</strong> button at the top of Shopify's editor (this is
          critical — the toggle alone is just a staged change), then come back
          and click <strong>Re-check</strong>.
        </Text>
        <InlineStack gap="200">
          <Button onClick={() => openTop(activateUrl)} variant="primary">Enable Bundler</Button>
          <Button onClick={check}>Re-check</Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
