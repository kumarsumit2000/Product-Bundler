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
    badgeBg: s.badgeBg || "#fce4e7",
    badgeBgInactive: s.badgeBgInactive || "#e5e7eb",
    badgeText: s.badgeText || "#d9263a",
    radius: px(s.borderRadius, 10),
    paddingX: px(s.paddingX, 14),
    paddingY: px(s.paddingY, 14),
  };
}

export function ProgressiveGiftPreview({ values, demoCartTotal = 75 }: Props) {
  const t = styleToTokens(values.style);

  const tiers = values.thresholds
    .map((tier) => {
      const isShipping = tier.kind === "free_shipping";
      const productImage = tier.variant?.image ?? tier.product?.image;
      const defaultTitle = isShipping
        ? "Free shipping"
        : (tier.product?.title ?? tier.variant?.productTitle ?? "Free gift");
      const minSpend = parseFloat(tier.minSpend || "0") || 0;
      const remaining = Math.max(0, minSpend - demoCartTotal);
      // Auto strike: for free_gift use the picked product's price unless
      // the merchant typed a custom value.
      const autoStrike = !isShipping && tier.product?.priceCents != null
        ? `$${(tier.product.priceCents / 100).toFixed(2)}`
        : "";
      const productVariants = !isShipping ? (tier.product?.variants ?? []) : [];
      return {
        minSpend,
        label: tier.label || "FREE",
        lockedLabel: tier.lockedLabel || `$${minSpend.toFixed(0)}`,
        title: tier.title || defaultTitle,
        lockedTitle: tier.lockedTitle || `Spend $${remaining.toFixed(2)} to unlock`,
        labelCrossedOut: tier.labelCrossedOut || autoStrike,
        image: isShipping ? (tier.iconUrl || null) : (productImage ?? null),
        isShipping,
        iconEmoji: isShipping && !tier.iconUrl ? "🚚" : null,
        variants: productVariants,
      };
    })
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
                const containerStyle: React.CSSProperties =
                  layout === "grid"
                    ? {
                        display: "grid",
                        gridTemplateColumns: `repeat(${Math.min(visibleTiers.length, 2)}, 1fr)`,
                        gap: 8,
                      }
                    : layout === "inline"
                      ? { display: "flex", flexWrap: "wrap", gap: 8 }
                      : { display: "flex", flexDirection: "column", gap: 8 };

                return (
                  <div style={containerStyle}>
                    {visibleTiers.map((tier, i) => {
                      const unlocked = demoCartTotal >= tier.minSpend;
                      const showBadge = unlocked || values.showLockedLabels;
                      // Show the same FREE + strike style for both locked & unlocked
                      // so the merchant can see what the gift IS, not just the spend
                      // requirement. Locked-only spend amount stays in the title.
                      const badgeText = tier.label;
                      const showStrike = !!tier.labelCrossedOut;
                      return (
                        <div
                          key={i}
                          style={{
                            border: `2px solid ${unlocked ? t.cardBorder : t.cardBorderInactive}`,
                            background: unlocked ? t.cardBg : t.cardBgInactive,
                            borderRadius: t.radius,
                            color: t.heading,
                            padding: "10px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            fontSize: 12,
                            minWidth: 0,
                          }}
                        >
                          {tier.image ? (
                            <img
                              src={tier.image}
                              alt=""
                              style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                            />
                          ) : tier.iconEmoji ? (
                            <div style={{ width: 36, height: 36, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {tier.iconEmoji}
                            </div>
                          ) : (
                            <div style={{ width: 36, height: 36, background: "#cbd5e1", borderRadius: 4, flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontWeight: 600, lineHeight: 1.25 }}>
                              {unlocked ? tier.title : tier.lockedTitle}
                            </div>
                            {tier.variants.length > 1 && (
                              <select
                                disabled={!unlocked}
                                style={{
                                  alignSelf: "flex-start",
                                  fontSize: 11,
                                  padding: "3px 6px",
                                  border: "1px solid #d1d5db",
                                  borderRadius: 4,
                                  background: "#fff",
                                  color: "#1a1a1a",
                                  maxWidth: "100%",
                                  cursor: unlocked ? "pointer" : "not-allowed",
                                }}
                              >
                                {tier.variants.map((v) => (
                                  <option key={v.variantId} value={v.variantId} disabled={!v.available}>
                                    {v.title}{!v.available ? " (out of stock)" : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                              background: unlocked ? "#dcfce7" : "#f3f4f6",
                              color: unlocked ? "#166534" : "#6b7280",
                              flexShrink: 0,
                            }}
                          >
                            {unlocked ? "● Unlocked" : "○ Locked"}
                          </span>
                          {showBadge && (
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                background: t.badgeBg,
                                color: t.badgeText,
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              <span>{badgeText}</span>
                              {showStrike && (
                                <span style={{ textDecoration: "line-through", opacity: 0.85, fontWeight: 600 }}>
                                  {tier.labelCrossedOut}
                                </span>
                              )}
                            </div>
                          )}
                          {unlocked && !tier.isShipping && (
                            <button
                              type="button"
                              disabled
                              style={{
                                background: t.progressFill,
                                color: "#fff",
                                border: 0,
                                padding: "6px 14px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "not-allowed",
                                opacity: 0.95,
                                flexShrink: 0,
                              }}
                              title="Claim button (active on storefront)"
                            >
                              Claim
                            </button>
                          )}
                          {unlocked && tier.isShipping && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#166534",
                                flexShrink: 0,
                              }}
                            >
                              ✓ At checkout
                            </span>
                          )}
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
