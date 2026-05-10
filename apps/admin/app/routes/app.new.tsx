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

type CardKey =
  | "qb_same"
  | "bxgy"
  | "qb_diff"
  | "bundle"
  | "newsletter"
  | "progressive"
  | "bogo_simple"
  | "qb_volume_4"
  | "qb_free_gift"
  | "mix_match"
  | "free_shipping_bar"
  | "countdown_sale";
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

type RowProps = {
  selected?: boolean;
  popular?: string;
  title: string;
  sub?: string;
  save?: string;
  price?: string;
  strike?: string;
};

function Row({ selected = false, popular, title, sub, save, price, strike }: RowProps) {
  return (
    <div style={{ ...r.card(selected), alignItems: "flex-start" }}>
      {popular && <span style={r.popularPill}>★ {popular}</span>}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ color: "#888", fontSize: 11 }}>{sub}</span>}
        {(save || price) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {save && <span style={r.saveTag()}>{save}</span>}
            {price && (
              <span style={{ fontWeight: 700, marginLeft: "auto", whiteSpace: "nowrap" }}>
                {price}
                {strike && <span style={r.strike}>{strike}</span>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewQbSame() {
  return (
    <BlockStack gap="200">
      <Row title="Single" sub="Standard price" price="$729.95" />
      <Row selected popular="Most Popular" title="Duo" sub="You save 15%" save="SAVE $218.98" price="$1,240.92" strike="$1,459.90" />
    </BlockStack>
  );
}

function PreviewBxgy() {
  return (
    <BlockStack gap="200">
      <Row title="Buy 1, get 1 free" save="SAVE 50%" price="$729.95" strike="$1,459.90" />
      <Row title="Buy 2, get 3 free" save="SAVE 60%" price="$1,459.90" strike="$3,649.75" />
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <Row selected title="Buy 3, get 6 free" save="SAVE 67%" price="$2,189.85" strike="$6,569.55" />
        <div style={r.freeGiftBanner}>+ FREE special gift!</div>
      </div>
    </BlockStack>
  );
}

function PreviewQbDifferent() {
  return (
    <BlockStack gap="200">
      <div style={r.card(true)}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>1 pack</span>
          <span style={{ color: "#888", fontSize: 11 }}>Standard price</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...r.thumb, width: 18, height: 24, background: "#86efac" }} />
            <span style={{ fontSize: 11, color: "#374151" }}>{SAMPLE_PRODUCT}</span>
          </div>
        </div>
        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>$729.95</span>
      </div>
      <Row popular="MOST POPULAR" title="2 pack" sub="You save $218.98" price="$1,240.92" strike="$1,459.90" />
    </BlockStack>
  );
}

function PreviewBundle() {
  return (
    <BlockStack gap="200">
      <Row title={SAMPLE_PRODUCT} sub="Standard price" price="$729.95" />
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <Row selected title="Complete the bundle" sub="Save $271.98!" price="$1,087.92" strike="$1,359.90" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, background: "#fff", borderRadius: 6 }}>
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

function PreviewNewsletter() {
  return (
    <BlockStack gap="200">
      <div style={{
        background: "#fff7f8",
        border: "2px solid #fbe4e7",
        borderRadius: 10,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Get 10% off your first order</div>
        <div style={{ color: "#666", fontSize: 11 }}>
          Join our newsletter for early access to drops and exclusive deals.
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{
            flex: 1,
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 11,
            color: "#9ca3af",
          }}>
            you@email.com
          </div>
          <div style={{
            background: "var(--pumper-theme, #d9263a)",
            color: "#fff",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}>
            Subscribe
          </div>
        </div>
      </div>
      <div style={{
        background: "#fce4e7",
        color: "var(--pumper-theme, #d9263a)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 11,
        fontWeight: 600,
        textAlign: "center",
      }}>
        ✉ 1,284 customers already subscribed
      </div>
    </BlockStack>
  );
}

function PreviewProgressive() {
  return (
    <BlockStack gap="200">
      <Row title="1 pack" price="$729.95" />
      <Row title="2 pack" save="SAVE 15%" price="$1,240.92" strike="$1,459.90" />
      <Row selected title="3 pack" save="SAVE 15%" price="$1,861.38" strike="$2,189.85" />
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

function PreviewBogoSimple() {
  return (
    <BlockStack gap="200">
      <Row selected popular="Most Popular" title="Buy 1, get 1 free" save="SAVE 50%" price="$729.95" strike="$1,459.90" />
      <Text as="p" tone="subdued" alignment="center" variant="bodySm">
        Single-tier BOGO — simplest urgency offer.
      </Text>
    </BlockStack>
  );
}

function PreviewQbVolume4() {
  return (
    <BlockStack gap="200">
      <Row title="Single" price="$729.95" />
      <Row title="2 pack" save="SAVE 10%" price="$1,313.91" strike="$1,459.90" />
      <Row selected popular="Most Popular" title="4 pack" save="SAVE 20%" price="$2,335.84" strike="$2,919.80" />
      <Row title="8 pack" save="SAVE 30%" price="$4,087.72" strike="$5,839.60" />
    </BlockStack>
  );
}

function PreviewQbFreeGift() {
  return (
    <BlockStack gap="200">
      <Row title="Standard" price="$729.95" />
      <Row title="2 pack" save="SAVE 10%" price="$1,313.91" />
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        <Row selected popular="Most Popular" title="3 pack — Save 20%" save="SAVE 20%" price="$1,751.88" strike="$2,189.85" />
        <div style={r.freeGiftBanner}>🎁 + FREE gift unlocked!</div>
      </div>
    </BlockStack>
  );
}

function PreviewMixMatch() {
  return (
    <BlockStack gap="200">
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Pick any 3 — save 25%</span>
          <span style={{ fontSize: 11, color: "var(--pumper-theme, #d9263a)", fontWeight: 600 }}>3 / 3</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {["#86efac", "#fbcfe8", "#bfdbfe"].map((bg, i) => (
            <div key={i} style={{ background: "#fff", border: `2px solid ${i === 0 ? "var(--pumper-theme, #d9263a)" : "#fbe4e7"}`, borderRadius: 6, padding: 6, textAlign: "center", fontSize: 9 }}>
              <span style={{ ...r.thumb, width: "100%", height: 32, background: bg, display: "block", borderRadius: 3 }} />
              <div style={{ marginTop: 4, fontWeight: 600 }}>Item {i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewFreeShippingBar() {
  return (
    <BlockStack gap="200">
      <div style={{
        background: "#fff7f8",
        border: "2px solid #fbe4e7",
        borderRadius: 10,
        padding: 12,
        textAlign: "center",
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🚚 Free shipping over $50</div>
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>Spend $25 more to unlock</div>
        <div style={{ height: 6, background: "#fce4e7", borderRadius: 999 }}>
          <div style={{ width: "50%", height: "100%", background: "var(--pumper-theme, #d9263a)", borderRadius: 999 }} />
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewCountdownSale() {
  return (
    <BlockStack gap="200">
      <div style={{
        background: "#1a1a1a",
        color: "#fff",
        borderRadius: 8,
        padding: "12px 14px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sale ends in</div>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8, fontVariantNumeric: "tabular-nums" }}>
          <span><b style={{ color: "var(--pumper-theme, #d9263a)", fontSize: 18, fontWeight: 700 }}>06</b><i style={{ fontStyle: "normal", fontSize: 10, marginLeft: 1 }}>d</i></span>
          <span style={{ color: "var(--pumper-theme, #d9263a)" }}>:</span>
          <span><b style={{ color: "var(--pumper-theme, #d9263a)", fontSize: 18, fontWeight: 700 }}>22</b><i style={{ fontStyle: "normal", fontSize: 10, marginLeft: 1 }}>h</i></span>
          <span style={{ color: "var(--pumper-theme, #d9263a)" }}>:</span>
          <span><b style={{ color: "var(--pumper-theme, #d9263a)", fontSize: 18, fontWeight: 700 }}>14</b><i style={{ fontStyle: "normal", fontSize: 10, marginLeft: 1 }}>m</i></span>
          <span style={{ color: "var(--pumper-theme, #d9263a)" }}>:</span>
          <span><b style={{ color: "var(--pumper-theme, #d9263a)", fontSize: 18, fontWeight: 700 }}>03</b><i style={{ fontStyle: "normal", fontSize: 10, marginLeft: 1 }}>s</i></span>
        </div>
      </div>
      <Text as="p" tone="subdued" alignment="center" variant="bodySm">
        Drop in any page — pairs well with bundles + QBs.
      </Text>
    </BlockStack>
  );
}

const CARDS: CardSpec[] = [
  { key: "qb_same", title: "Quantity breaks for the same product", href: "/app/quantity-breaks/new", preview: PreviewQbSame },
  { key: "bxgy", title: "Buy X, get Y (BXGY) deal", href: "/app/quantity-breaks/new", preview: PreviewBxgy },
  { key: "qb_diff", title: "Quantity breaks for different products", href: "/app/quantity-breaks/new", preview: PreviewQbDifferent },
  { key: "bogo_simple", title: "Buy 1, get 1 free", href: "/app/quantity-breaks/new", preview: PreviewBogoSimple },
  { key: "qb_volume_4", title: "Volume discount (4 tiers)", href: "/app/quantity-breaks/new", preview: PreviewQbVolume4 },
  { key: "qb_free_gift", title: "Free gift with purchase", href: "/app/quantity-breaks/new", preview: PreviewQbFreeGift },
  { key: "bundle", title: "Complete the bundle", href: "/app/bundles/new", preview: PreviewBundle },
  { key: "mix_match", title: "Mix & match — pick any 3", href: "/app/bundles/new", preview: PreviewMixMatch },
  { key: "progressive", title: "Progressive gifts", href: "/app/progressive-gifts/new", preview: PreviewProgressive },
  { key: "free_shipping_bar", title: "Free shipping bar", href: "/app/progressive-gifts/new", preview: PreviewFreeShippingBar },
  { key: "countdown_sale", title: "Sale countdown", href: "/app/countdowns/new", preview: PreviewCountdownSale },
  { key: "newsletter", title: "Newsletter signup", href: "/app/newsletter", preview: PreviewNewsletter },
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
    const sep = card.href.includes("?") ? "&" : "?";
    const target = `${card.href}${sep}template=${card.key}&theme=${encodeURIComponent(theme)}`;
    navigate(target);
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
          alignItems: "start",
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
