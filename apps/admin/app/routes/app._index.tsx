import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Text, Button } from "@shopify/polaris";
import { useState } from "react";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { AppEmbedStatusBanner } from "~/components/AppEmbedStatusBanner";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);
  return json({ shopDomain: session.shop });
}

// Each key MUST match a template preset in ~/lib/template-presets so the
// create form prefills correctly when the card's CTA is clicked.
type CardKey = "qb_volume_4" | "bxgy" | "qb_free_gift" | "qb_subscribe" | "mix_match";

const ACCENT = "var(--pumper-theme, #7B1E2A)";
// Tints derived from the active theme color so every fill (card backgrounds,
// pills, the free-gift row) re-colors when the merchant picks a theme — not
// just the borders. `pct` is how much theme color is mixed over white.
const tint = (pct: number) => `color-mix(in srgb, ${ACCENT} ${pct}%, #fff)`;

// ---- primitives ---------------------------------------------------------
const S = {
  tier: (selected: boolean): React.CSSProperties => ({
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 14,
    border: `2px solid ${selected ? ACCENT : "transparent"}`,
    background: selected ? "#fff" : tint(10),
    cursor: "pointer",
    fontSize: 15,
    color: "#1a1a1a",
  }),
  price: { fontWeight: 800, fontSize: 17, whiteSpace: "nowrap" } as React.CSSProperties,
  strike: { textDecoration: "line-through", color: "#b6989d", fontSize: 13 } as React.CSSProperties,
  corner: {
    position: "absolute",
    top: -11,
    right: 14,
    background: ACCENT,
    color: "#fff",
    fontSize: 11,
    padding: "2px 10px",
    borderRadius: 7,
    fontWeight: 700,
  } as React.CSSProperties,
};

function Radio({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 999,
        border: `2px solid ${on ? ACCENT : tint(45)}`,
        background: on ? `radial-gradient(${ACCENT} 6px, #fff 7px)` : "#fff",
        flexShrink: 0,
      }}
    />
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        border: `2px solid ${on ? ACCENT : tint(45)}`,
        background: on ? ACCENT : "#fff",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

function Dropdown({ children, width }: { children: React.ReactNode; width?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        border: `1px solid ${tint(45)}`,
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 12,
        color: "#5a4248",
        background: "#fff",
        minWidth: width ?? 120,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      <span aria-hidden style={{ color: ACCENT }}>▾</span>
    </span>
  );
}

function Tile({ emoji, size = 46 }: { emoji: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: "#fff",
        border: `1px solid ${tint(30)}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.5),
        flexShrink: 0,
      }}
    >
      {emoji}
    </span>
  );
}

function StdPill() {
  return (
    <span style={{ border: `1px solid ${ACCENT}`, color: "#1a1a1a", fontSize: 11, padding: "1px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
      Standard Price
    </span>
  );
}

function OffPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: tint(22), color: ACCENT, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function PriceCol({ price, strike }: { price: string; strike?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
      <span style={S.price}>{price}</span>
      {strike && <span style={S.strike}>{strike}</span>}
    </div>
  );
}

// ---- card 1: Buy More Save More (QB volume) -----------------------------
function BuyMoreSaveMore() {
  const tiers = [
    { t: "Buy 1", std: true, price: "$24.95" },
    { t: "Buy 2", off: "20% OFF", price: "$39.92", strike: "$49.90" },
    { t: "Buy 3", off: "30% OFF", price: "$52.41", strike: "$74.85" },
    { t: "Buy 4", off: "40% OFF", price: "$59.88", strike: "$99.80", corner: "Best Value" },
  ];
  const [sel, setSel] = useState(2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tiers.map((r, i) => (
        <div key={i} style={S.tier(sel === i)} onClick={(e) => { e.stopPropagation(); setSel(i); }}>
          {r.corner && <span style={S.corner}>{r.corner}</span>}
          <Radio on={sel === i} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{r.t}</span>
            {r.std && <StdPill />}
            {r.off && <OffPill>{r.off}</OffPill>}
          </div>
          <PriceCol price={r.price} strike={r.strike} />
        </div>
      ))}
    </div>
  );
}

// ---- card 2: BOGO Offers (BXGY) -----------------------------------------
function BogoOffers() {
  const bars = [
    { t: "Buy 1", std: true, price: "$24.95", emoji: "🧥" },
    { t: "Buy 2 Get 1 Free!", off: "33% OFF", price: "$49.90", strike: "$74.85", emoji: "🧥" },
    { t: "Buy 3 Get 2 Free!", off: "40% OFF", price: "$74.85", strike: "$124.75", emoji: "🧥" },
  ];
  const [sel, setSel] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {bars.map((b, i) => (
        <div key={i} style={S.tier(sel === i)} onClick={(e) => { e.stopPropagation(); setSel(i); }}>
          <Tile emoji={b.emoji} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{b.t}</div>
            {b.std ? (
              <span style={{ color: ACCENT, fontSize: 12 }}>Standard Price</span>
            ) : (
              <span style={{ color: ACCENT, fontSize: 12, fontWeight: 600 }}>{b.off}</span>
            )}
          </div>
          <PriceCol price={b.price} strike={b.strike} />
        </div>
      ))}
    </div>
  );
}

// ---- card 3: Unlock Free Gifts (QB free gift) ---------------------------
function UnlockFreeGifts() {
  const [sel, setSel] = useState(1); // 0 = Single, 1 = Duo
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Single */}
      <div style={{ ...S.tier(sel === 0), flexDirection: "column", alignItems: "stretch", gap: 10 }} onClick={(e) => { e.stopPropagation(); setSel(0); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Radio on={sel === 0} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700 }}>Single</span>{" "}
            <span style={{ color: ACCENT, fontSize: 12 }}>Standard Price</span>
          </div>
          <span style={S.price}>$24.95</span>
        </div>
        {sel === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 32, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#6b5258" }}>Title</span>
            <span style={{ fontSize: 11, color: "#9c858a" }}>#1</span>
            <Dropdown width={150}>Selling Plans S…</Dropdown>
          </div>
        )}
      </div>
      {/* Duo */}
      <div style={{ position: "relative" }}>
        <span style={S.corner}>Most Popular</span>
        <div style={{ borderRadius: 14, overflow: "hidden", border: `2px solid ${sel === 1 ? ACCENT : "transparent"}` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 14px 12px", background: sel === 1 ? "#fff" : tint(10), cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setSel(1); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Radio on={sel === 1} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>Duo</div>
                <span style={{ color: ACCENT, fontSize: 12 }}>You Save $9.98</span>
              </div>
              <PriceCol price="$39.92" strike="$49.90" />
            </div>
            {sel === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#6b5258" }}>Title</span>
                  <span style={{ fontSize: 11, color: "#9c858a" }}>#1</span>
                  <Dropdown width={140}>Selling Plans S…</Dropdown>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#6b5258", visibility: "hidden" }}>Title</span>
                  <span style={{ fontSize: 11, color: "#9c858a" }}>#2</span>
                  <Dropdown width={140}>Selling Plans S…</Dropdown>
                </div>
              </div>
            )}
          </div>
          {/* free gift row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: tint(42) }}>
            <Tile emoji="🎁" size={40} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, background: "#fff", borderRadius: 5, padding: "1px 6px", color: ACCENT, fontWeight: 700 }}>1x</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Gift Name</span>
              {sel === 1 && (
                <>
                  <Dropdown width={70}>Color</Dropdown>
                  <Dropdown width={64}>Size</Dropdown>
                </>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
              <span style={{ background: ACCENT, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 6 }}>FREE</span>
              <span style={{ ...S.strike, color: "#7a5a60" }}>$100.00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- card 4: Subscribe & Save (QB subscribe) ----------------------------
function SubscribeSave() {
  const [sel, setSel] = useState(0);
  const [sub, setSub] = useState(true);
  const packs = [
    { t: "1 Pack", std: true, price: "$24.95", emoji: "🧴" },
    { t: "2 Packs", off: "20% OFF", price: "$39.92", strike: "$49.90", emoji: "🧴" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {packs.map((p, i) => (
        <div key={i} style={S.tier(sel === i)} onClick={(e) => { e.stopPropagation(); setSel(i); }}>
          <Tile emoji={p.emoji} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontWeight: 700 }}>{p.t}</span>
            {p.std ? <span><StdPill /></span> : <span><OffPill>{p.off}</OffPill></span>}
          </div>
          <PriceCol price={p.price} strike={p.strike} />
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
        <span style={{ flex: 1, height: 1, background: tint(30) }} />
        <span style={{ color: ACCENT, fontWeight: 700, fontSize: 13 }}>Purchase Options</span>
        <span style={{ flex: 1, height: 1, background: tint(30) }} />
      </div>
      <div style={{ border: `2px dashed ${ACCENT}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setSub((v) => !v); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Check on={sub} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>Subscribe &amp; Save</div>
            <span style={{ color: ACCENT, fontSize: 12 }}>Cancel anytime</span>
          </div>
          <PriceCol price="$22.46" strike="$24.95" />
        </div>
        {sub && <Dropdown width={180}>Monthly Subscription</Dropdown>}
      </div>
    </div>
  );
}

// ---- card 5: Bundle & Save (mix & match) --------------------------------
function BundleSave() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: tint(12), borderRadius: 18, padding: "30px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Tile emoji="🩳" size={66} />
          <span style={{ color: ACCENT, fontSize: 22, fontWeight: 800 }}>+</span>
          <Tile emoji="👕" size={66} />
        </div>
        <Tile emoji="🧤" size={66} />
      </div>
    </div>
  );
}

type CardSpec = { key: CardKey; title: string; href: string; cta: string; body: () => JSX.Element };

const CARDS: CardSpec[] = [
  { key: "qb_volume_4", title: "Buy More Save More", href: "/app/quantity-breaks/new", cta: "Customize it now", body: BuyMoreSaveMore },
  { key: "bxgy", title: "BOGO Offers", href: "/app/bxgy-offers/new", cta: "Customize it now", body: BogoOffers },
  { key: "qb_free_gift", title: "Unlock Free Gifts", href: "/app/quantity-breaks/new", cta: "Customize it now", body: UnlockFreeGifts },
  { key: "qb_subscribe", title: "Subscribe & Save", href: "/app/quantity-breaks/new", cta: "Customize it now", body: SubscribeSave },
  { key: "mix_match", title: "Bundle & Save", href: "/app/bundles/new", cta: "Create a Bundle", body: BundleSave },
];

const THEMES = [
  { color: "#7B1E2A", label: "Maroon" },
  { color: "#1a1a1a", label: "Black" },
  { color: "#d9263a", label: "Red" },
  { color: "#f59e0b", label: "Amber" },
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
  const [theme, setTheme] = useState<string>(THEMES[0]!.color);
  const [selected, setSelected] = useState<CardKey>("qb_volume_4");

  function onChoose(card: CardSpec) {
    const sep = card.href.includes("?") ? "&" : "?";
    navigate(`${card.href}${sep}template=${card.key}&theme=${encodeURIComponent(theme)}`);
  }

  return (
    <Page
      title="Choose Winning Bundle Theme"
      subtitle="Full customization coming right after — pick a template to get started."
    >
      <div style={{ marginBottom: 16 }}>
        <AppEmbedStatusBanner shopDomain={shopDomain} />
      </div>
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

      <div style={{ ["--pumper-theme" as string]: theme, columnCount: 2, columnGap: 16 }}>
        {CARDS.map((card) => {
          const isSelected = selected === card.key;
          const Body = card.body;
          return (
            <div
              key={card.key}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(card.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(card.key); }
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
              <div style={{ flex: 1 }}>
                <Body />
              </div>
              <Button fullWidth size="large" variant="primary" onClick={() => onChoose(card)}>
                {card.cta}
              </Button>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
