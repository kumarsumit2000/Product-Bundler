import { Card, BlockStack, InlineStack, Text, TextField, Button } from "@shopify/polaris";
import { useState } from "react";

type Props = { snippet: string };

export function EmbedCodeCard({ snippet }: Props) {
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
