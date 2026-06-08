import { Card, BlockStack, InlineStack, Text, TextField, Button } from "@shopify/polaris";
import { useState } from "react";

type Props = {
  plan: "free" | "starter" | "growth" | "unlimited";
  // Present on edit pages. Absent on create pages — renders a "available after save" hint.
  snippet?: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EmbedCodeCard({ plan: _plan, snippet }: Props) {
  if (!snippet) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Embed code</Text>
          <Text as="p" tone="subdued">
            After you save, you&apos;ll get an embed code that lets you display this
            widget anywhere your theme accepts HTML — homepage, blog post, custom page,
            or a page builder&apos;s HTML element.
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return <EmbedCodeCardWithSnippet snippet={snippet} />;
}

function EmbedCodeCardWithSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (insecure context, restrictive CSP).
      // The TextField is selectable so manual copy still works.
    }
  };
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">Embed code</Text>
        <Text as="p" tone="subdued">
          Paste this anywhere your theme accepts HTML — homepage, blog post, custom page,
          or a page builder&apos;s HTML element.
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          <strong>Note:</strong> the embed code renders the widget wherever you paste it,
          even if your Visibility setting says &quot;Specific products&quot;. Visibility rules only
          apply when the widget is auto-mounted via the theme app block (drag-drop on a PDP).
        </Text>
        <TextField
          label="Embed code"
          labelHidden
          value={snippet}
          readOnly
          autoComplete="off"
          multiline={2}
          onChange={() => { /* readOnly; satisfy required prop type */ }}
        />
        <InlineStack align="end">
          <Button onClick={onCopy} variant={copied ? "primary" : "secondary"}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
