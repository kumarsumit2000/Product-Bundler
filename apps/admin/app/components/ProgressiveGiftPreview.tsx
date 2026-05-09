import { Card, BlockStack, Text } from "@shopify/polaris";
import type { ProgressiveGiftFormValues } from "./ProgressiveGiftForm";

type Props = {
  values: ProgressiveGiftFormValues;
  // Demo cart subtotal in dollars to show the progress bar at a realistic point.
  demoCartTotal?: number;
};

export function ProgressiveGiftPreview({ values, demoCartTotal = 75 }: Props) {
  const tiers = values.thresholds
    .map((t) => ({
      minSpend: parseFloat(t.minSpend || "0") || 0,
      label: t.label || "Free gift",
      image: t.variant?.image,
      strike: t.variant?.variantTitle ?? "",
    }))
    .sort((a, b) => a.minSpend - b.minSpend);

  const maxSpend = tiers.length > 0 ? tiers[tiers.length - 1]!.minSpend : 0;
  const pct = maxSpend > 0 ? Math.min(100, (demoCartTotal / maxSpend) * 100) : 0;
  const nextTier = tiers.find((t) => t.minSpend > demoCartTotal);
  const remaining = nextTier ? Math.max(0, nextTier.minSpend - demoCartTotal) : 0;

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Live preview</Text>
        <div
          style={{
            background: "#fff7f8",
            border: "1px solid #fbe4e7",
            borderRadius: 10,
            padding: 14,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textAlign: "center" }}>
            {values.headline || "Unlock free gifts with your order"}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 10, textAlign: "center" }}>
            {nextTier
              ? `Spend $${remaining.toFixed(2)} more to unlock ${nextTier.label}`
              : tiers.length > 0
                ? "All gifts unlocked!"
                : "Add at least one threshold to see the preview"}
          </div>

          {tiers.length > 0 && (
            <>
              <div
                style={{
                  position: "relative",
                  height: 6,
                  background: "#fce4e7",
                  borderRadius: 999,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${pct}%`,
                    background: "#d9263a",
                    borderRadius: 999,
                    transition: "width .3s",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(tiers.length, 4)}, 1fr)`,
                  gap: 6,
                }}
              >
                {tiers.map((t, i) => {
                  const unlocked = demoCartTotal >= t.minSpend;
                  return (
                    <div
                      key={i}
                      style={{
                        border: `2px solid ${unlocked ? "#d9263a" : "#fbe4e7"}`,
                        background: "#fff",
                        borderRadius: 8,
                        padding: 6,
                        fontSize: 9,
                        textAlign: "center",
                        opacity: unlocked ? 1 : 0.55,
                      }}
                    >
                      <div
                        style={{
                          background: unlocked ? "#d9263a" : "#cbd5e1",
                          color: "#fff",
                          padding: "1px 4px",
                          borderRadius: 3,
                          fontSize: 8,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {unlocked ? "FREE" : `$${t.minSpend.toFixed(0)}`}
                      </div>
                      {t.image ? (
                        <img
                          src={t.image}
                          alt=""
                          style={{ width: "100%", height: 36, objectFit: "cover", borderRadius: 4 }}
                        />
                      ) : (
                        <div style={{ height: 36, background: "#cbd5e1", borderRadius: 4 }} />
                      )}
                      <div style={{ marginTop: 4, fontWeight: 600, lineHeight: 1.2 }}>
                        {t.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <Text as="p" tone="subdued" variant="bodySm">
          Demo cart total: ${demoCartTotal.toFixed(2)}
        </Text>
      </BlockStack>
    </Card>
  );
}
