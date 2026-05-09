import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useNavigate } from "@remix-run/react";
import { Page, BlockStack, Text, Button, Banner } from "@shopify/polaris";
import { useState } from "react";
import { authenticate, type AppLoadContext } from "~/shopify.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  await authenticate.admin(request, ctx);
  return json({});
}

type CardKey = "qb_same" | "bxgy" | "qb_diff" | "bundle" | "subscription" | "progressive";
type CardSpec = {
  key: CardKey;
  title: string;
  href: string | null;
  comingSoon?: boolean;
  preview: () => JSX.Element;
};

const SAMPLE_PRODUCT = "The Multi-location Snowboard";

// ----- Reusable preview primitives ---------------------------------------
const r = {
  card: (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? "var(--pumper-theme, #d9263a)" : "#fbe4e7"}`,
    background: "#fff7f8",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "#1a1a1a",
    position: "relative",
  }),
  radio: (selected: boolean): React.CSSProperties => ({
    width: 16, height: 16, borderRadius: 999,
    border: `2px solid ${selected ? "var(--pumper-theme, #d9263a)" : "#cbd5e1"}`,
    background: selected ? "radial-gradient(var(--pumper-theme, #d9263a) 5px, #fff 5px)" : "#fff",
    flexShrink: 0,
  }),
  badge: (): React.CSSProperties => ({
    background: "var(--pumper-theme, #d9263a)",
    color: "#fff",
    fontSize: 9,
    padding: "1px 6px",
    borderRadius: 3,
    fontWeight: 700,
    letterSpacing: ".5px",
  }),
  saveTag: (): React.CSSProperties => ({
    background: "#fce4e7",
    color: "var(--pumper-theme, #d9263a)",
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 3,
    fontWeight: 600,
  }),
  strike: { textDecoration: "line-through", color: "#a3a3a3", marginLeft: 4, fontSize: 11 } as React.CSSProperties,
  freeGiftBanner: {
    background: "var(--pumper-theme, #d9263a)",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
  } as React.CSSProperties,
  thumb: {
    width: 36, height: 36, borderRadius: 4, background: "#cbd5e1",
  } as React.CSSProperties,
  popularPill: {
    position: "absolute", top: -10, right: 8,
    background: "var(--pumper-theme, #d9263a)", color: "#fff",
    fontSize: 9, padding: "2px 6px", borderRadius: 999, fontWeight: 700,
    letterSpacing: ".5px",
  } as React.CSSProperties,
};

// ----- Per-type previews --------------------------------------------------

function PreviewQbSame() {
  return (
    <BlockStack gap="200">
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>Single</span>
        <span style={{ color: "#888", fontSize: 11 }}>Standard price</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>$729.95</span>
      </div>
      <div style={r.card(true)}>
        <span style={r.popularPill}>★ Most Popular</span>
        <span style={r.radio(true)} />
        <span style={{ fontWeight: 600 }}>Duo</span>
        <span style={r.saveTag()}>SAVE $218.98</span>
        <span style={{ color: "#888", fontSize: 11 }}>You save 15%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $1,240.92<span style={r.strike}>$1,459.90</span>
        </span>
      </div>
    </BlockStack>
  );
}

function PreviewBxgy() {
  return (
    <BlockStack gap="200">
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>Buy 1, get 1 free</span>
        <span style={r.saveTag()}>SAVE 50%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $729.95<span style={r.strike}>$1,459.90</span>
        </span>
      </div>
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>Buy 2, get 3 free</span>
        <span style={r.saveTag()}>SAVE 60%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $1,459.90<span style={r.strike}>$3,649.75</span>
        </span>
      </div>
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={r.radio(true)} />
          <span style={{ fontWeight: 600 }}>Buy 3, get 6 free</span>
          <span style={r.saveTag()}>SAVE 67%</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            $2,189.85<span style={r.strike}>$6,569.55</span>
          </span>
        </div>
        <div style={r.freeGiftBanner}>+ FREE special gift!</div>
      </div>
    </BlockStack>
  );
}

function PreviewQbDifferent() {
  return (
    <BlockStack gap="200">
      <div style={r.card(true)}>
        <span style={r.radio(true)} />
        <BlockStack gap="050">
          <span style={{ fontWeight: 600 }}>1 pack</span>
          <span style={{ color: "#888", fontSize: 11 }}>Standard price</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ ...r.thumb, width: 18, height: 36, background: "#86efac" }} />
            <span style={{ fontSize: 11, color: "#374151" }}>{SAMPLE_PRODUCT}</span>
          </div>
        </BlockStack>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>$729.95</span>
      </div>
      <div style={{ ...r.card(false), flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <span style={{ ...r.popularPill, top: -8 }}>MOST POPULAR</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={r.radio(false)} />
          <BlockStack gap="050">
            <span style={{ fontWeight: 600 }}>2 pack</span>
            <span style={{ color: "#888", fontSize: 11 }}>You save $218.98</span>
          </BlockStack>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            $1,240.92<span style={r.strike}>$1,459.90</span>
          </span>
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewBundle() {
  return (
    <BlockStack gap="200">
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <BlockStack gap="050">
          <span style={{ fontWeight: 600 }}>{SAMPLE_PRODUCT}</span>
          <span style={{ color: "#888", fontSize: 11 }}>Standard price</span>
        </BlockStack>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>$729.95</span>
      </div>
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={r.radio(true)} />
          <BlockStack gap="050">
            <span style={{ fontWeight: 600 }}>Complete the bundle</span>
            <span style={{ color: "#888", fontSize: 11 }}>Save $271.98!</span>
          </BlockStack>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            $1,087.92<span style={r.strike}>$1,359.90</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px", background: "#fff", borderRadius: 6 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ ...r.thumb, width: 28, height: 36, background: "#86efac" }} />
            <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center" }}>{SAMPLE_PRODUCT}</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>$583.96 <span style={r.strike}>$729.95</span></span>
          </div>
          <span style={{ color: "var(--pumper-theme, #d9263a)", fontSize: 16, fontWeight: 700 }}>+</span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ ...r.thumb, width: 28, height: 36, background: "#fbcfe8" }} />
            <span style={{ fontSize: 9, fontWeight: 600, textAlign: "center" }}>The Multi-managed Snowboard</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>$503.96 <span style={r.strike}>$629.95</span></span>
          </div>
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewSubscription() {
  return (
    <BlockStack gap="200">
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>Buy 1, get 1 free</span>
        <span style={r.saveTag()}>SAVE 60%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $583.96<span style={r.strike}>$1,459.90</span>
        </span>
      </div>
      <div style={r.card(true)}>
        <span style={r.radio(true)} />
        <span style={{ fontWeight: 600 }}>Buy 3, get 6 free</span>
        <span style={r.saveTag()}>SAVE 73%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $1,751.88<span style={r.strike}>$6,569.55</span>
        </span>
      </div>
      <div style={r.freeGiftBanner}>+ FREE special gift!</div>
      <div
        style={{
          border: "1px dashed var(--pumper-theme, #d9263a)",
          borderRadius: 8,
          padding: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <span style={{ width: 14, height: 14, border: "2px solid var(--pumper-theme, #d9263a)", borderRadius: 3, background: "var(--pumper-theme, #d9263a)" }} />
        <BlockStack gap="050">
          <span style={{ fontWeight: 600 }}>Subscribe & Save 20%</span>
          <span style={{ color: "#888", fontSize: 10 }}>Delivered weekly</span>
        </BlockStack>
      </div>
    </BlockStack>
  );
}

function PreviewProgressive() {
  return (
    <BlockStack gap="200">
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>1 pack</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>$729.95</span>
      </div>
      <div style={r.card(false)}>
        <span style={r.radio(false)} />
        <span style={{ fontWeight: 600 }}>2 pack</span>
        <span style={r.saveTag()}>SAVE 15%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $1,240.92<span style={r.strike}>$1,459.90</span>
        </span>
      </div>
      <div style={r.card(true)}>
        <span style={r.radio(true)} />
        <span style={{ fontWeight: 600 }}>3 pack</span>
        <span style={r.saveTag()}>SAVE 15%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700 }}>
          $1,861.38<span style={r.strike}>$2,189.85</span>
        </span>
      </div>
      <Text as="h4" variant="headingSm" alignment="center">🎁 Unlock Free gifts with your order</Text>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { tag: "FREE", title: "Free shipping", strike: "" },
          { tag: "FREE $629.95", title: "The Multi-managed Snowboard", strike: "$629.95" },
          { tag: "FREE $5.99", title: "Socks", strike: "$5.99" },
        ].map((g) => (
          <div key={g.title} style={{ border: "2px solid #fbe4e7", borderRadius: 8, padding: 6, fontSize: 9, textAlign: "center" }}>
            <div style={{ background: "var(--pumper-theme, #d9263a)", color: "#fff", padding: "1px 4px", borderRadius: 3, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>
              {g.tag}
            </div>
            <span style={{ ...r.thumb, width: "100%", height: 36, display: "block", margin: "0 auto" }} />
            <div style={{ marginTop: 4, fontWeight: 600 }}>{g.title}</div>
          </div>
        ))}
      </div>
    </BlockStack>
  );
}

const CARDS: CardSpec[] = [
  { key: "qb_same", title: "Quantity breaks for the same product", href: "/app/quantity-breaks/new", preview: PreviewQbSame },
  { key: "bxgy", title: "Buy X, get Y (BXGY) deal", href: "/app/quantity-breaks/new", preview: PreviewBxgy },
  { key: "qb_diff", title: "Quantity breaks for different products", href: "/app/quantity-breaks/new", preview: PreviewQbDifferent },
  { key: "bundle", title: "Complete the bundle", href: "/app/bundles/new", preview: PreviewBundle },
  { key: "subscription", title: "Subscription", href: "/app/bundles/new", preview: PreviewSubscription },
  { key: "progressive", title: "Progressive gifts", href: "/app/progressive-gifts/new", preview: PreviewProgressive },
];

const THEMES = [
  { color: "#1a1a1a", label: "Black" },
  { color: "#d9263a", label: "Red" },
  { color: "#f59e0b", label: "Amber" },
  { color: "#84cc16", label: "Lime" },
  { color: "#10b981", label: "Emerald" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#8b5cf6", label: "Violet" },
  { color: "#ec4899", label: "Pink" },
];

export default function ChooseDiscountType() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<string>(THEMES[1]!.color);
  const [selected, setSelected] = useState<CardKey>("qb_same");
  const [comingSoonShown, setComingSoonShown] = useState<string | null>(null);

  function onChoose(card: CardSpec) {
    if (card.comingSoon || !card.href) {
      setComingSoonShown(card.title);
      return;
    }
    navigate(card.href);
  }

  return (
    <Page
      title="Choose a discount type"
      subtitle="You can fully customize it later."
      backAction={{ content: "Back", url: "/app" }}
    >
      {/* Color theme picker, top-right */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Text as="span" tone="subdued" variant="bodySm">Color theme</Text>
        {THEMES.map((t) => (
          <button
            key={t.color}
            type="button"
            aria-label={t.label}
            onClick={() => setTheme(t.color)}
            style={{
              width: 28, height: 28, borderRadius: 999,
              background: t.color,
              border: theme === t.color ? "2px solid #1a1a1a" : "2px solid transparent",
              boxShadow: theme === t.color ? "0 0 0 2px #fff inset" : undefined,
              cursor: "pointer",
              padding: 0,
            }}
          />
        ))}
      </div>

      {comingSoonShown && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" onDismiss={() => setComingSoonShown(null)}>
            <Text as="p">
              <strong>{comingSoonShown}</strong> is coming soon.
            </Text>
          </Banner>
        </div>
      )}

      <div
        style={{
          // CSS variable consumed by every preview to tint accent colors
          ["--pumper-theme" as string]: theme,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {CARDS.map((card) => {
          const isSelected = selected === card.key;
          const PreviewComp = card.preview;
          return (
            <div
              key={card.key}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(card.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(card.key);
                }
              }}
              style={{
                background: "#fff",
                border: `2px solid ${isSelected ? theme : "#e5e7eb"}`,
                borderRadius: 12,
                padding: 16,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
              aria-pressed={isSelected}
            >
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                <PreviewComp />
              </div>
              <div style={{ textAlign: "center" }}>
                <Text as="p" variant="headingSm">
                  {card.title}
                  {card.comingSoon && (
                    <Text as="span" variant="bodySm" tone="subdued">  · Coming soon</Text>
                  )}
                </Text>
              </div>
              <Button fullWidth variant="primary" onClick={() => onChoose(card)}>
                Choose
              </Button>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
