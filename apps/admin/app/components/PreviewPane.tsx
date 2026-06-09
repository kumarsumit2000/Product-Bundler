import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match" | "newsletter" | "bxgy";
  id: string;
  config: unknown;
  // When true, render just the auto-sizing iframe with no Polaris Card chrome
  // or "Live preview" heading. Used by the dashboard template cards.
  bare?: boolean;
};

export function PreviewPane({ type, id, config, bare = false }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastSentRef = useRef<string>("");
  const [height, setHeight] = useState<number>(280);

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

  // Auto-size the iframe to its content. The iframe is same-origin so we can
  // read body.scrollHeight directly. Polls every 250ms — cheap and avoids
  // dealing with cross-frame ResizeObserver wiring.
  useEffect(() => {
    const id = window.setInterval(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc?.body) return;
      const next = Math.max(140, doc.documentElement.scrollHeight || doc.body.scrollHeight);
      setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // Sticky behavior intentionally removed — preview now sits at the top of
  // the page in a column layout, so pinning it on scroll just covered the
  // form below.

  const iframe = (
    <iframe
      ref={iframeRef}
      src={`/preview/${type}/${encodeURIComponent(id)}`}
      style={{ width: "100%", height: `${height}px`, border: "none", display: "block", transition: "height .15s" }}
      title="Widget preview"
    />
  );

  if (bare) {
    return iframe;
  }

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
          {iframe}
        </Box>
      </BlockStack>
    </Card>
  );
}
