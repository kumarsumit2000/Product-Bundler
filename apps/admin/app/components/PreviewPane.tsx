import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import { useEffect, useRef } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match" | "newsletter";
  id: string;
  config: unknown;
};

export function PreviewPane({ type, id, config }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSentRef = useRef<string>("");

  // Push config updates to the preview iframe (debounced).
  useEffect(() => {
    const next = JSON.stringify(config);
    if (next === lastSentRef.current) return;
    const handle = setTimeout(() => {
      lastSentRef.current = next;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "pumper:preview", config },
        "*",
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [config]);

  // Sticky behavior intentionally removed — preview now sits at the top of
  // the page in a column layout, so pinning it on scroll just covered the
  // form below.

  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Live preview</Text>
        <Box
          borderWidth="025"
          borderColor="border"
          borderRadius="200"
          overflowX="hidden"
          overflowY="hidden"
        >
          <iframe
            ref={iframeRef}
            src={`/preview/${type}/${encodeURIComponent(id)}`}
            style={{ width: "100%", height: "560px", border: "none", display: "block" }}
            title="Widget preview"
          />
        </Box>
      </BlockStack>
    </Card>
  );
}
