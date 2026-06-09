import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Text, Button } from "@shopify/polaris";
import { useMemo, useState } from "react";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { AppEmbedStatusBanner } from "~/components/AppEmbedStatusBanner";
import { PreviewPane } from "~/components/PreviewPane";
import { buildTemplatePreview } from "~/lib/dashboard-previews";

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
};

const CARDS: CardSpec[] = [
  { key: "qb_volume_4", title: "Buy More Save More", href: "/app/quantity-breaks/new", cta: "Customize it now" },
  { key: "bxgy", title: "BOGO Offers", href: "/app/bxgy-offers/new", cta: "Customize it now" },
  { key: "qb_free_gift", title: "Unlock Free Gifts", href: "/app/quantity-breaks/new", cta: "Customize it now" },
  { key: "qb_subscribe", title: "Subscribe & Save", href: "/app/quantity-breaks/new", cta: "Customize it now" },
  { key: "mix_match", title: "Bundle & Save", href: "/app/bundles/new", cta: "Create a Bundle" },
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

// Renders one template card with a LIVE storefront widget in the body. The
// preview config is memoized per card+theme so re-renders don't rebuild it
// (and so PreviewPane's identity-debounced postMessage stays stable).
function TemplateCard({
  card,
  theme,
  isSelected,
  onSelect,
  onChoose,
}: {
  card: CardSpec;
  theme: string;
  isSelected: boolean;
  onSelect: () => void;
  onChoose: () => void;
}) {
  const { type, config } = useMemo(
    () => buildTemplatePreview(card.key, theme),
    [card.key, theme],
  );
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
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
        <PreviewPane bare type={type} id="template" config={config} />
      </div>
      <Button
        fullWidth
        size="large"
        variant="primary"
        onClick={onChoose}
      >
        {card.cta}
      </Button>
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
          columnCount: 2,
          columnGap: 16,
        }}
      >
        {CARDS.map((card) => (
          <TemplateCard
            key={card.key}
            card={card}
            theme={theme}
            isSelected={selected === card.key}
            onSelect={() => setSelected(card.key)}
            onChoose={() => onChoose(card)}
          />
        ))}
      </div>
    </Page>
  );
}
