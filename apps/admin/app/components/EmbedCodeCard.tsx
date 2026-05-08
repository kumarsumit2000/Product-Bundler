import { Card, BlockStack, InlineStack, Text, TextField, Button, Badge } from "@shopify/polaris";
import { useState } from "react";

type Props = {
  plan: "free" | "starter" | "growth" | "unlimited";
  // Present on edit pages. Absent on create pages — renders a "available after save" hint.
  snippet?: string;
};

export function EmbedCodeCard({ plan, snippet }: Props) {
  if (plan === "free") {
    return (
      <Card>
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">Embed code</Text>
            <Badge tone="info">Paid plans</Badge>
          </InlineStack>
          <Text as="p" tone="subdued">
            Want to display this on your homepage, blog post, or any other page?
            Embed codes let you paste this widget anywhere your theme accepts HTML.
            Available on Starter, Growth, and Unlimited plans.
          </Text>
          <InlineStack align="end">
            <Button variant="primary" url="/app/billing">Upgrade to use embed codes</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    );
  }

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
