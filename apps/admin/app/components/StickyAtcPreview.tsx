import { Card, BlockStack, Text } from "@shopify/polaris";
import type { StickyAtcConfig } from "../../drizzle/schema";

type Props = { value: StickyAtcConfig };

export function StickyAtcPreview({ value }: Props) {
  if (!value.enabled) return null;
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Sticky add-to-cart preview</Text>
        <Text as="p" tone="subdued" variant="bodySm">
          This bar appears at the bottom of the product page once a customer scrolls past
          the original Add to cart button.
        </Text>
        <div
          style={{
            background: value.backgroundColor || "#FFFFFF",
            color: value.textColor || "#1A1A1A",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.08)",
            borderRadius: 6,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {value.showImage && (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 4,
                background: "#e5e7eb",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
              aria-hidden="true"
            >
              📦
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Sample product
            </div>
            {value.showPrice && (
              <div style={{ fontSize: 12, opacity: 0.75 }}>$49.99</div>
            )}
          </div>
          {value.showQty && (
            <input
              type="number"
              min={1}
              defaultValue={1}
              readOnly
              style={{
                width: 50,
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: 4,
                background: "#fff",
                color: "#111",
                fontSize: 13,
              }}
            />
          )}
          <button
            type="button"
            disabled
            style={{
              background: value.buttonBg || "#1A1A1A",
              color: value.buttonText || "#FFFFFF",
              border: 0,
              padding: "10px 18px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "default",
              flexShrink: 0,
            }}
          >
            {value.ctaLabel || "Add to cart"}
          </button>
        </div>
      </BlockStack>
    </Card>
  );
}
