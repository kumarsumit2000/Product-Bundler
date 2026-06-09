import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, BlockStack, Text, Button, Banner } from "@shopify/polaris";
import { useState } from "react";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { AppEmbedStatusBanner } from "~/components/AppEmbedStatusBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  return json({ shopDomain: session.shop });
}

// Each key MUST match a template preset in ~/lib/template-presets so the
// create form prefills correctly when "Customize it now" is clicked.
type CardKey = "qb_volume_4" | "bxgy" | "qb_free_gift" | "qb_subscribe" | "mix_match";
type CardSpec = {
  key: CardKey;
  title: string;
  href: string;
  cta: string;
  preview: () => JSX.Element;
};

// ----- Reusable preview primitives ---------------------------------------
const r = {
  card: (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? "var(--pumper-theme, #d9263a)" : "#fbe4e7"}`,
    background: selected ? "#fff" : "#fdeef0",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 14,
    color: "#1a1a1a",
    position: "relative",
  }),
  radio: (selected: boolean): React.CSSProperties => ({
    width: 18,
    height: 18,
    borderRadius: 999,
    border: `2px solid ${selected ? "var(--pumper-theme, #d9263a)" : "#cbd5e1"}`,
    background: selected
      ? "radial-gradient(var(--pumper-theme, #d9263a) 5px, #fff 6px)"
      : "#fff",
    flexShrink: 0,
  }),
  stdPill: {
    border: "1px solid #d8a7af",
    color: "#1a1a1a",
    fontSize: 11,
    padding: "1px 8px",
    borderRadius: 6,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  offPill: {
    background: "#fbd5dc",
    color: "var(--pumper-theme, #b21e36)",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 6,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  price: { fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" } as React.CSSProperties,
  strike: { textDecoration: "line-through", color: "#9aa0a6", fontSize: 12 } as React.CSSProperties,
  thumb: { width: 44, height: 44, borderRadius: 8, background: "#cfd4da", flexShrink: 0 } as React.CSSProperties,
  cornerPill: {
    position: "absolute",
    top: -11,
    right: 12,
    background: "var(--pumper-theme, #7b1e2a)",
    color: "#fff",
    fontSize: 10,
    padding: "2px 10px",
    borderRadius: 6,
    fontWeight: 700,
    letterSpacing: ".3px",
  } as React.CSSProperties,
  dropdown: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    color: "#374151",
    background: "#fff",
    minWidth: 120,
  } as React.CSSProperties,
};

function Radio({ selected }: { selected: boolean }) {
  return <span style={r.radio(selected)} />;
}

function Dropdown({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <span style={{ ...r.dropdown, ...(width ? { minWidth: width } : {}) }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      <span aria-hidden style={{ color: "#9aa0a6" }}>▾</span>
    </span>
  );
}

// A standard tier row: [radio] [image?] title + badge ........ price / strike
function Tier(props: {
  selected?: boolean;
  imageBg?: string;
  title: string;
  std?: boolean;
  off?: string;
  sub?: string;
  price: string;
  strike?: string;
  corner?: string;
}) {
  const { selected = false, imageBg, title, std, off, sub, price, strike, corner } = props;
  return (
    <div style={r.card(selected)}>
      {corner && <span style={r.cornerPill}>{corner}</span>}
      <Radio selected={selected} />
      {imageBg && <span style={{ ...r.thumb, background: imageBg }} />}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>{title}</span>
          {std && <span style={r.stdPill}>Standard Price</span>}
          {off && <span style={r.offPill}>{off}</span>}
        </div>
        {sub && <span style={{ color: "var(--pumper-theme, #b21e36)", fontSize: 12 }}>{sub}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={r.price}>{price}</span>
        {strike && <span style={r.strike}>{strike}</span>}
      </div>
    </div>
  );
}

// ----- The 5 featured templates ------------------------------------------

function PreviewBuyMoreSaveMore() {
  return (
    <BlockStack gap="300">
      <Tier selected title="Buy 1" std price="$24.95" />
      <Tier title="Buy 2" off="20% OFF" price="$39.92" strike="$49.90" />
      <Tier title="Buy 3" off="30% OFF" price="$52.41" strike="$74.85" />
      <Tier title="Buy 4" off="40% OFF" price="$59.88" strike="$99.80" corner="Best Value" />
    </BlockStack>
  );
}

function PreviewBogoOffers() {
  return (
    <BlockStack gap="300">
      <Tier selected imageBg="#9aa0a6" title="Buy 1" std price="$24.95" />
      <Tier imageBg="#7b8088" title="Buy 2 Get 1 Free!" off="33% OFF" price="$49.90" strike="$74.85" />
      <Tier imageBg="#5f646b" title="Buy 3 Get 2 Free!" off="40% OFF" price="$74.85" strike="$124.75" />
    </BlockStack>
  );
}

function PreviewUnlockFreeGifts() {
  return (
    <BlockStack gap="300">
      <div style={{ ...r.card(true), flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Radio selected />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700 }}>Single</span>{" "}
            <span style={{ color: "var(--pumper-theme, #b21e36)", fontSize: 12 }}>Standard Price</span>
          </div>
          <span style={r.price}>$24.95</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 30 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Title</span>
          <span style={{ fontSize: 11, color: "#9aa0a6" }}>#1</span>
          <Dropdown width={150}>Selling Plans S…</Dropdown>
        </div>
      </div>
      <div style={{ position: "relative", border: "2px solid var(--pumper-theme, #7b1e2a)", borderRadius: 12, overflow: "hidden" }}>
        <span style={r.cornerPill}>Most Popular</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fdeef0" }}>
          <Radio selected={false} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Duo</div>
            <span style={{ color: "var(--pumper-theme, #b21e36)", fontSize: 12 }}>You Save $9.98</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={r.price}>$39.92</span>
            <span style={r.strike}>$49.90</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--pumper-theme, #e89aa8)" }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <span style={{ flex: 1, color: "#fff", fontWeight: 700 }}>+1 FREE GIFT</span>
          <span style={{ ...r.strike, color: "#fbe4e7" }}>$100.00</span>
        </div>
      </div>
    </BlockStack>
  );
}

function PreviewSubscribeSave() {
  return (
    <BlockStack gap="300">
      <Tier selected imageBg="#cfd4da" title="1 Pack" std price="$24.95" />
      <Tier imageBg="#cfd4da" title="2 Packs" off="20% OFF" price="$39.92" strike="$49.90" />
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
        <span style={{ flex: 1, height: 1, background: "#f0c8cf" }} />
        <Text as="span" variant="headingSm" tone="subdued">Purchase Options</Text>
        <span style={{ flex: 1, height: 1, background: "#f0c8cf" }} />
      </div>
      <div style={{ border: "2px dashed var(--pumper-theme, #b21e36)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: "#fdeef0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: "var(--pumper-theme, #7b1e2a)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Subscribe &amp; Save</div>
            <span style={{ color: "var(--pumper-theme, #b21e36)", fontSize: 12 }}>Cancel anytime</span>
          </div>
          <span style={r.price}>$35.94</span>
        </div>
        <Dropdown>Monthly Subscription</Dropdown>
      </div>
    </BlockStack>
  );
}

function PreviewBundleSave() {
  const tile = (emoji: string) => (
    <span
      style={{
        width: 64,
        height: 64,
        borderRadius: 14,
        background: "#fff",
        border: "1px solid #f4d4da",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 28,
      }}
    >
      {emoji}
    </span>
  );
  return (
    <BlockStack gap="300">
      <div
        style={{
          background: "#fde7ec",
          borderRadius: 16,
          padding: "28px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {tile("🩳")}
          <span style={{ color: "var(--pumper-theme, #b21e36)", fontSize: 20, fontWeight: 700 }}>+</span>
          {tile("👕")}
        </div>
        {tile("🧤")}
      </div>
    </BlockStack>
  );
}

const CARDS: CardSpec[] = [
  { key: "qb_volume_4", title: "Buy More Save More", href: "/app/quantity-breaks/new", cta: "Customize it now", preview: PreviewBuyMoreSaveMore },
  { key: "bxgy", title: "BOGO Offers", href: "/app/bxgy-offers/new", cta: "Customize it now", preview: PreviewBogoOffers },
  { key: "qb_free_gift", title: "Unlock Free Gifts", href: "/app/quantity-breaks/new", cta: "Customize it now", preview: PreviewUnlockFreeGifts },
  { key: "qb_subscribe", title: "Subscribe & Save", href: "/app/quantity-breaks/new", cta: "Customize it now", preview: PreviewSubscribeSave },
  { key: "mix_match", title: "Bundle & Save", href: "/app/bundles/new", cta: "Create a Bundle", preview: PreviewBundleSave },
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

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
      <Text as="h3" variant="headingMd">{children}</Text>
      <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
    </div>
  );
}

export default function ChooseDiscountType() {
  const navigate = useNavigate();
  const { shopDomain } = useLoaderData<typeof loader>();
  const [theme, setTheme] = useState<string>(THEMES[1]!.color);
  const [selected, setSelected] = useState<CardKey>("qb_volume_4");

  function onChoose(card: CardSpec) {
    const sep = card.href.includes("?") ? "&" : "?";
    const target = `${card.href}${sep}template=${card.key}&theme=${encodeURIComponent(theme)}`;
    navigate(target);
  }

  return (
    <Page
      title="Choose Winning Bundle Theme"
      subtitle="Full customization coming right after — pick a template to get started."
    >
      <div style={{ marginBottom: 16 }}>
        <AppEmbedStatusBanner shopDomain={shopDomain} />
      </div>
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

      <div
        style={{
          // CSS variable consumed by every preview to tint accent colors
          ["--pumper-theme" as string]: theme,
          columnCount: 3,
          columnGap: 16,
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
                borderRadius: 16,
                padding: 18,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                breakInside: "avoid",
                marginBottom: 16,
                width: "100%",
              }}
              aria-pressed={isSelected}
            >
              <CardTitle>{card.title}</CardTitle>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                <PreviewComp />
              </div>
              <Button
                fullWidth
                size="large"
                variant="primary"
                onClick={() => onChoose(card)}
              >
                {card.cta}
              </Button>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
