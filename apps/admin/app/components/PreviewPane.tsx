import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import { useEffect, useRef } from "react";

type Props = {
  type: "bundle" | "qb" | "mix_match" | "newsletter";
  id: string;
  config: unknown;
};

export function PreviewPane({ type, id, config }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
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

  // JS-driven sticky. CSS sticky kept failing because Polaris's Layout grid
  // applies overflow + align-self to the section in ways we couldn't override
  // reliably. This watches the wrapper's position and pins the inner card
  // with position: fixed when scrolled past 16px from the top.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    if (!wrapper || !card) return;

    let ticking = false;
    function update() {
      ticking = false;
      const wrap = wrapper!;
      const c = card!;
      const wrapRect = wrap.getBoundingClientRect();
      // wrapper height is what reserves the column space — keep it the same
      // as the card's natural height so layout doesn't collapse when we
      // switch the inner card to fixed positioning.
      const cardHeight = c.offsetHeight;
      wrap.style.height = `${cardHeight}px`;

      if (wrapRect.top < 16) {
        c.style.position = "fixed";
        c.style.top = "16px";
        c.style.width = `${wrap.offsetWidth}px`;
        c.style.left = `${wrapRect.left}px`;
        c.style.zIndex = "5";
      } else {
        c.style.position = "";
        c.style.top = "";
        c.style.width = "";
        c.style.left = "";
        c.style.zIndex = "";
      }
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div ref={wrapperRef}>
      <div ref={cardRef}>
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
      </div>
    </div>
  );
}
