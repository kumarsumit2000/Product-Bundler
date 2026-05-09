import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import { useEffect, useRef } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match";
  id: string;
  config: unknown;
};

// Inject once per page-load: force sticky-friendly overflow on Polaris layout
// ancestors. CSS sticky breaks if any ancestor has overflow != visible, and
// Polaris's Layout / Page wrappers default to constraints that kill it.
const STICKY_FIX_CSS = `
  /* Sticky positioning needs every ancestor up to the scroll container to
     have overflow: visible. Polaris's Layout.Section / Page wrappers default
     to clip/hidden in some Polaris versions which kills sticky outright. */
  .Polaris-Page,
  .Polaris-Page__Content,
  .Polaris-Layout,
  .Polaris-Layout__Section {
    overflow: visible !important;
  }
  /* Polaris's CSS Grid Layout stretches each Section to the row's height by
     default, so the sticky child has no scroll headroom. Pin the Section that
     hosts our preview to the top of the row. */
  .Polaris-Layout__Section:has(.pumper-sticky-preview) {
    align-self: flex-start !important;
  }
  .pumper-sticky-preview {
    position: sticky;
    top: 16px;
    align-self: flex-start;
    height: fit-content;
  }
`;

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
    <>
      <style dangerouslySetInnerHTML={{ __html: STICKY_FIX_CSS }} />
      <div className="pumper-sticky-preview">
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
    </>
  );
}
