import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Page, BlockStack, Grid, InlineStack, SkeletonBodyText } from "@shopify/polaris";
import { PolarisVizProvider } from "@shopify/polaris-viz";
import "@shopify/polaris-viz/build/esm/styles.css";
import { eq } from "drizzle-orm";
import { authenticate, type AppLoadContext } from "~/shopify.server";
import { getDb, schema } from "~/db.server";
import {
  getKpis,
  getActivitySeries,
  getConversionsAndSales,
  getTopBundles,
  getQbTierBreakdown,
  getBundleListForFilter,
} from "~/lib/analytics/dashboard-query";
import { getUsage } from "~/lib/billing/usage";
import { KpiCard } from "~/components/dashboard/KpiCard";
import { ActivityChart } from "~/components/dashboard/ActivityChart";
import { ConversionsSalesPair } from "~/components/dashboard/ConversionsSalesPair";
import { TopBundlesTable } from "~/components/dashboard/TopBundlesTable";
import { QbTierBreakdownTable } from "~/components/dashboard/QbTierBreakdownTable";
import { DateRangePicker, type DateRangeValue } from "~/components/dashboard/DateRangePicker";
import { UsageBanner } from "~/components/UsageBanner";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ctx = context as AppLoadContext;
  const { session } = await authenticate.admin(request, ctx);

  const db = getDb(ctx.cloudflare.env.DB);
  await db
    .insert(schema.shops)
    .values({
      id: session.shop,
      scopes: session.scope ?? "",
      installedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.shops.id,
      set: { scopes: session.scope ?? "", uninstalledAt: null },
    });

  const url = new URL(request.url);
  const rangeParam = (url.searchParams.get("range") ?? "7d") as DateRangeValue;
  const days = rangeParam === "30d" ? 30 : rangeParam === "90d" ? 90 : 7;
  const range = { startDate: dateNDaysAgo(days - 1), endDate: todayUtc() };

  const bundlesParam = url.searchParams.get("bundles") ?? "";
  const selectedBundleIds = bundlesParam ? bundlesParam.split(",").filter(Boolean) : [];

  const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, session.shop)).limit(1))[0];
  const currency = shopRow?.currency ?? "USD";
  const locale = shopRow?.primaryLocale ?? "en";

  type KpisResult = Awaited<ReturnType<typeof getKpis>>;
  type ActivityResult = Awaited<ReturnType<typeof getActivitySeries>>;
  type ConvSalesResult = Awaited<ReturnType<typeof getConversionsAndSales>>;
  type TopBundlesResult = Awaited<ReturnType<typeof getTopBundles>>;
  type QbTierResult = Awaited<ReturnType<typeof getQbTierBreakdown>>;
  type BundleListResult = Awaited<ReturnType<typeof getBundleListForFilter>>;

  const kpiFallback: KpisResult = { totalRevenueCents: 0, totalOrders: 0, bundleOrders: 0, revenueSeries: [], ordersSeries: [] };
  type UsageResult = Awaited<ReturnType<typeof getUsage>>;
  const usageFallback: UsageResult = {
    plan: "free",
    monthlyOrderCount: 0,
    lifetimeOrderCount: 0,
    orderCap: 50,
    isLifetimeCap: true,
    percentUsed: 0,
    overOnce: false,
    resetAt: null,
  };
  const [kpis, activity, convSales, topBundles, qbTier, bundleList, usage] = await Promise.all([
    getKpis(db, session.shop, range).catch((): KpisResult => kpiFallback),
    getActivitySeries(db, session.shop, range, selectedBundleIds.length > 0 ? selectedBundleIds : undefined).catch((): ActivityResult => []),
    getConversionsAndSales(db, session.shop, range).catch((): ConvSalesResult => ({ conversions: [], sales: [] })),
    getTopBundles(db, session.shop, range).catch((): TopBundlesResult => []),
    getQbTierBreakdown(db, session.shop, range).catch((): QbTierResult => []),
    getBundleListForFilter(db, session.shop).catch((): BundleListResult => []),
    getUsage(db, session.shop).catch((err): UsageResult => {
      console.error("[dashboard] getUsage failed:", err);
      return usageFallback;
    }),
  ]);

  return json({
    shop: session.shop, currency, locale, rangeParam, selectedBundleIds,
    kpis, activity, convSales, topBundles, qbTier, bundleList, usage,
  });
}

function formatMoney(cents: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default function Dashboard() {
  const { currency, locale, rangeParam, selectedBundleIds, kpis, activity, convSales, topBundles, qbTier, bundleList, usage } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  // Polaris-Viz reads `window` at module load — SSR would throw ReferenceError.
  // Render skeleton on the server, swap to live charts once mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const setRange = (range: DateRangeValue) => {
    const next = new URLSearchParams(searchParams);
    next.set("range", range);
    setSearchParams(next);
  };

  const setBundles = (ids: string[]) => {
    const next = new URLSearchParams(searchParams);
    if (ids.length === 0) next.delete("bundles");
    else next.set("bundles", ids.join(","));
    setSearchParams(next);
  };

  const aov = kpis.totalOrders > 0 ? kpis.totalRevenueCents / kpis.totalOrders : 0;

  if (!mounted) {
    return (
      <Page title="Analytics">
        <BlockStack gap="500">
          <SkeletonBodyText lines={6} />
        </BlockStack>
      </Page>
    );
  }

  return (
    <PolarisVizProvider>
      <Page title="Analytics">
        <BlockStack gap="500">
          <UsageBanner usage={usage} />
          <InlineStack align="end">
            <DateRangePicker value={rangeParam} onChange={setRange} />
          </InlineStack>

          <Grid>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Total revenue"
                value={formatMoney(kpis.totalRevenueCents, currency, locale)}
                series={kpis.revenueSeries.map((s) => ({ x: s?.date ?? "", y: (s?.cents ?? 0) / 100 }))}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Average order value"
                value={formatMoney(aov, currency, locale)}
                series={kpis.ordersSeries.map((s, i) => ({ x: s?.date ?? "", y: (s?.count ?? 0) > 0 ? (kpis.revenueSeries[i]?.cents ?? 0) / (s?.count ?? 1) / 100 : 0 }))}
              />
            </Grid.Cell>
            <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 2, lg: 4, xl: 4 }}>
              <KpiCard
                label="Total conversions"
                value={String(kpis.totalOrders)}
                series={kpis.ordersSeries.map((s) => ({ x: s?.date ?? "", y: s?.count ?? 0 }))}
              />
            </Grid.Cell>
          </Grid>

          <ActivityChart
            series={activity}
            bundles={bundleList}
            selectedBundleIds={selectedBundleIds}
            onChange={setBundles}
          />

          <ConversionsSalesPair
            conversions={convSales.conversions}
            sales={convSales.sales}
            currency={currency}
            locale={locale}
          />

          <TopBundlesTable rows={topBundles} currency={currency} locale={locale} />

          <QbTierBreakdownTable rows={qbTier} currency={currency} locale={locale} />
        </BlockStack>
      </Page>
    </PolarisVizProvider>
  );
}
