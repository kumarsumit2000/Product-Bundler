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
    cardBgInactive: s.cardBgInactive || s.cardBg || "#fff",
    cardBorderInactive: s.cardBorderInactive || "#fbe4e7",
    badgeBg: s.badgeBg || "#d9263a",
    badgeBgInactive: s.badgeBgInactive || "#cbd5e1",
    badgeText: s.badgeText || "#fff",
    radius: px(s.borderRadius, 10),
    paddingX: px(s.paddingX, 14),
    paddingY: px(s.paddingY, 14),
  };
}

export function ProgressiveGiftPreview({ values, demoCartTotal = 75 }: Props) {
  const t = styleToTokens(values.style);

  const tiers = values.thresholds
    .map((tier) => ({
      minSpend: parseFloat(tier.minSpend || "0") || 0,
      label: tier.label || "FREE",
      lockedLabel: tier.lockedLabel || `$${parseFloat(tier.minSpend || "0") || 0}`,
      title: tier.title || tier.variant?.productTitle || "Free gift",
      lockedTitle: tier.lockedTitle || "Locked",
      labelCrossedOut: tier.labelCrossedOut || "",
      image: tier.variant?.image,
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
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, textAlign: "center", color: t.heading }}>
            {values.headline || "🎁 Unlock free gifts with your order"}
          </div>
          {values.subtitle && (
            <div style={{ fontSize: 11, color: t.text, marginBottom: 6, textAlign: "center" }}>
              {values.subtitle}
            </div>
          )}
          <div style={{ fontSize: 11, color: t.text, marginBottom: 10, textAlign: "center" }}>
            {nextTier
              ? `Spend $${remaining.toFixed(2)} more to unlock ${nextTier.title || nextTier.label}`
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

              {(() => {
                const visibleTiers = values.hideLocked
                  ? tiers.filter((tier) => demoCartTotal >= tier.minSpend)
                  : tiers;
                if (visibleTiers.length === 0) {
                  return (
                    <div style={{ fontSize: 11, color: t.text, textAlign: "center", padding: "8px 0" }}>
                      Hidden until unlocked
                    </div>
                  );
                }
                const layout = values.layout;
                const isRow = layout === "inline";
                const isStacked = layout === "stacked";
                const containerStyle: React.CSSProperties = isRow
                  ? { display: "flex", flexDirection: "column", gap: 6 }
                  : isStacked
                    ? { display: "flex", flexDirection: "column", gap: 6 }
                    : {
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.min(visibleTiers.length, 4)}, 1fr)`,
                        gap: 6,
                      };
                return (
                  <div style={containerStyle}>
                    {visibleTiers.map((tier, i) => {
                      const unlocked = demoCartTotal >= tier.minSpend;
                      const showBadge = unlocked || values.showLockedLabels;
                      const badgeText = unlocked ? tier.label : tier.lockedLabel;
                      const cardStyle: React.CSSProperties = {
                        border: `2px solid ${unlocked ? t.cardBorder : t.cardBorderInactive}`,
                        background: unlocked ? t.cardBg : t.cardBgInactive,
                        borderRadius: Math.max(0, t.radius - 2),
                        color: t.heading,
                      };
                      // ─── Inline / Stacked: row layout (image left, content right) ───
                      if (isRow || isStacked) {
                        return (
                          <div
                            key={i}
                            style={{
                              ...cardStyle,
                              padding: 8,
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              fontSize: 11,
                            }}
                          >
                            {tier.image ? (
                              <img
                                src={tier.image}
                                alt=""
                                style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                              />
                            ) : (
                              <div style={{ width: 32, height: 32, background: "#cbd5e1", borderRadius: 4, flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>
                              {unlocked ? tier.title : tier.lockedTitle}
                            </div>
                            {showBadge && (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span
                                  style={{
                                    background: unlocked ? t.badgeBg : t.badgeBgInactive,
                                    color: t.badgeText,
                                    padding: "2px 6px",
                                    borderRadius: 3,
                                    fontSize: 10,
                                    fontWeight: 700,
                                  }}
                                >
                                  {badgeText}
                                </span>
                                {unlocked && tier.labelCrossedOut && (
                                  <span style={{ textDecoration: "line-through", color: "#a3a3a3", fontSize: 10 }}>
                                    {tier.labelCrossedOut}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                      // ─── Grid (default): card with image on top ───
                      return (
                        <div
                          key={i}
                          style={{
                            ...cardStyle,
                            padding: 6,
                            fontSize: 9,
                            textAlign: "center",
                          }}
                        >
                          {showBadge && (
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
                              {badgeText}
                              {unlocked && tier.labelCrossedOut && (
                                <span style={{ textDecoration: "line-through", marginLeft: 4, opacity: 0.8 }}>
                                  {tier.labelCrossedOut}
                                </span>
                              )}
                            </div>
                          )}
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
                            {unlocked ? tier.title : tier.lockedTitle}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
