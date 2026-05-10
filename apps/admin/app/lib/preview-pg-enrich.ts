import { fetchProductDetails } from "./shopify-product-fetch";

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

type RawThreshold = {
  minSpendCents: number;
  kind?: "free_gift" | "free_shipping" | null;
  label: string;
  title?: string | null;
  lockedTitle?: string | null;
  labelCrossedOut?: string | null;
  lockedLabel?: string | null;
  iconUrl?: string | null;
  giftProductId?: string | null;
  giftVariantId?: string | null;
};

type RawPg = {
  id: string;
  name: string;
  status: string;
  headline: string | null;
  subtitle: string | null;
  layout: string;
  hideLocked: boolean;
  showLockedLabels: boolean;
  styleOverrides: Record<string, unknown> | null;
  thresholds: RawThreshold[];
};

export type PreviewPg = {
  id: string;
  name: string;
  headline: string | null;
  subtitle: string | null;
  layout: "stacked" | "grid" | "inline";
  hideLocked: boolean;
  showLockedLabels: boolean;
  styleOverrides: Record<string, unknown> | null;
  thresholds: Array<{
    minSpendCents: number;
    kind: "free_gift" | "free_shipping";
    label: string;
    title: string | null;
    lockedTitle: string | null;
    labelCrossedOut: string | null;
    lockedLabel: string | null;
    iconUrl: string | null;
    giftProductId: string | null;
    giftVariantId: string | null;
    productTitle: string | null;
    productImage: string | null;
    variants: Array<{ variantId: string; title: string; available: boolean; priceCents: number }>;
  }>;
};

export async function enrichProgressiveGiftsForPreview(
  admin: AdminGraphqlClient,
  pgs: RawPg[],
): Promise<PreviewPg[]> {
  const active = pgs.filter((p) => p.status === "active");
  const productIds = new Set<string>();
  for (const p of active) {
    for (const t of p.thresholds) {
      if (t.giftProductId) productIds.add(t.giftProductId);
    }
  }
  const productMap = productIds.size > 0
    ? await fetchProductDetails(admin, [...productIds]).catch((err) => {
        console.error("[preview-pg-enrich] fetchProductDetails failed (non-fatal):", err);
        return {} as Awaited<ReturnType<typeof fetchProductDetails>>;
      })
    : {};

  return active.map((p) => ({
    id: p.id,
    name: p.name,
    headline: p.headline,
    subtitle: p.subtitle,
    layout: p.layout as "stacked" | "grid" | "inline",
    hideLocked: p.hideLocked,
    showLockedLabels: p.showLockedLabels,
    styleOverrides: p.styleOverrides,
    thresholds: p.thresholds.map((t) => {
      const detail = t.giftProductId ? productMap[t.giftProductId] : undefined;
      return {
        minSpendCents: t.minSpendCents,
        kind: (t.kind ?? "free_gift") as "free_gift" | "free_shipping",
        label: t.label,
        title: t.title ?? null,
        lockedTitle: t.lockedTitle ?? null,
        labelCrossedOut: t.labelCrossedOut ?? null,
        lockedLabel: t.lockedLabel ?? null,
        iconUrl: t.iconUrl ?? null,
        giftProductId: t.giftProductId ?? null,
        giftVariantId: t.giftVariantId ?? null,
        productTitle: detail?.title ?? null,
        productImage: detail?.image ?? null,
        variants: detail?.variants ?? [],
      };
    }),
  }));
}
