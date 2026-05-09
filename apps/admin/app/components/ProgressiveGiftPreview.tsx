import { Card, BlockStack, Text } from "@shopify/polaris";
import type { ProgressiveGiftFormValues, ProgressiveStyleForm } from "./ProgressiveGiftForm";

type Props = {
  values: ProgressiveGiftFormValues;
  // Demo cart subtotal in dollars to show the progress bar at a realistic point.
  demoCartTotal?: number;
};

const px = (s: string, fallback: number) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};

function styleToTokens(s: ProgressiveStyleForm) {
  return {
    bg: s.backgroundColor || "#fff7f8",
    border: s.borderColor || "#fbe4e7",
    heading: s.headingColor || "#1a1a1a",
    text: s.textColor || "#666",
    progressFill: s.progressFill || "#d9263a",
    progressTrack: s.progressTrack || "#fce4e7",
    cardBg: s.cardBg || "#fff",
    cardBorder: s.cardBorder || "#d9263a",
    cardBorderInactive: s.cardBorder || "#fbe4e7",
    badgeBg: s.badgeBg || "#d9263a",
    badgeBgInactive: "#cbd5e1",
    badgeText: s.badgeText || "#fff",
    radius: px(s.borderRadius, 10),
    paddingX: px(s.paddingX, 14),
    paddingY: px(s.paddingY, 14),
  };
}

export function ProgressiveGiftPreview({ values, demoCartTotal = 75 }: Props) {
  const t = styleToTokens(values.style);

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
            background: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: t.radius,
            padding: `${t.paddingY}px ${t.paddingX}px`,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textAlign: "center", color: t.heading }}>
            {values.headline || "Unlock free gifts with your order"}
          </div>
          <div style={{ fontSize: 11, color: t.text, marginBottom: 10, textAlign: "center" }}>
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
                  background: t.progressTrack,
                  borderRadius: 999,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${pct}%`,
                    background: t.progressFill,
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
                {tiers.map((tier, i) => {
                  const unlocked = demoCartTotal >= tier.minSpend;
                  return (
                    <div
                      key={i}
                      style={{
                        border: `2px solid ${unlocked ? t.cardBorder : t.cardBorderInactive}`,
                        background: t.cardBg,
                        borderRadius: Math.max(0, t.radius - 2),
                        padding: 6,
                        fontSize: 9,
                        textAlign: "center",
                        opacity: unlocked ? 1 : 0.55,
                        color: t.heading,
                      }}
                    >
                      <div
                        style={{
                          background: unlocked ? t.badgeBg : t.badgeBgInactive,
                          color: t.badgeText,
                          padding: "1px 4px",
                          borderRadius: 3,
                          fontSize: 8,
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {unlocked ? "FREE" : `$${tier.minSpend.toFixed(0)}`}
                      </div>
                      {tier.image ? (
                        <img
                          src={tier.image}
                          alt=""
                          style={{ width: "100%", height: 36, objectFit: "cover", borderRadius: 4 }}
                        />
                      ) : (
                        <div style={{ height: 36, background: "#cbd5e1", borderRadius: 4 }} />
                      )}
                      <div style={{ marginTop: 4, fontWeight: 600, lineHeight: 1.2 }}>
                        {tier.label}
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
