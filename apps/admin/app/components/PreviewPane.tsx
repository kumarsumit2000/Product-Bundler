import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import { useEffect, useRef } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match";
  id: string;
  config: unknown;
};

export function PreviewPane({ type, id, config }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSentRef = useRef<string>("");

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

  return (
    <div style={{ position: "sticky", top: 16 }}>
      <Card>
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">Live preview</Text>
          <Box borderWidth="025" borderColor="border" borderRadius="200" overflowX="hidden" overflowY="hidden">
            <iframe
              ref={iframeRef}
              src={`/preview/${type}/${encodeURIComponent(id)}`}
              style={{ width: "100%", height: "560px", border: "none", display: "block" }}
              title="Widget preview"
            />
          </Box>
        </BlockStack>
      </Card>
    </div>
  );
}
