import { Card, Text, BlockStack } from "@shopify/polaris";
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
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Live preview</Text>
        <iframe
          ref={iframeRef}
          src={`/preview/${type}/${encodeURIComponent(id)}`}
          style={{ width: "100%", height: "560px", border: "1px solid #e3e3e3", borderRadius: 8 }}
          title="Widget preview"
        />
      </BlockStack>
    </Card>
  );
}
