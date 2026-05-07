# Phase 6 — Analytics Pipeline + Dashboard

**Status:** Approved 2026-05-07
**Phase:** 6 of 9 (per CLAUDE.md §15)
**Estimate:** ~1 week

---

## 1. Goal

Give merchants a real analytics dashboard so they can see whether the app is making them money. Three coordinated additions:

1. **Revenue attribution** — when an order is paid, the `orders/paid` webhook walks the line items, finds those tagged with `_pumper_bundle_id`, and attributes the per-line revenue to the right bundle / QB / Mix & Match in D1 rollup tables.
2. **Storefront event capture** — the `/api/storefront/event` endpoint (Phase 4 stub) starts writing impression / click / add-to-cart events to a D1 `events` table for funnel analysis.
3. **Full analytics dashboard** at `/app` — KPI cards, recent-activity line chart with per-bundle filter, side-by-side conversions+sales charts, top-bundles table, per-tier QB breakdown table.

No Analytics Engine, no cron triggers — D1-only pipeline that runs on the existing infrastructure (free Pages plan stays viable).

---

## 2. Scope

### In scope

- New D1 migration `0004_phase_6_analytics.sql` with 3 tables: `events`, `revenue_daily`, `bundle_daily`.
- Drizzle schema additions for the 3 tables.
- New `/webhooks/orders/paid` route + `orders/paid` topic subscription in `shopify.app.toml`.
- New `apps/admin/app/lib/analytics/` module with `attribution.ts`, `revenue-rollup.ts`, `events-write.ts`, `dashboard-query.ts`.
- `/api/storefront/event` (Phase 4 stub) replaced with real D1 insert.
- `app._index.tsx` rewritten as the full analytics dashboard (currently a Phase 0 placeholder).
- 6 new dashboard components in `apps/admin/app/components/dashboard/`.
- Polaris Viz dependency added to admin `package.json`.

### Out of scope (deferred)

- Analytics Engine writes (would need paid plan for cron). Spec's hourly-cron pipeline replaced with synchronous D1 writes.
- Refund handling (`refunds/create` webhook). v1 overstates net revenue slightly; acceptable.
- Per-customer-currency analytics (Shopify Markets). Stored in shop primary currency only.
- 90-day retention sweeper for `events`. Phase 8 polish.
- Per-shop rate limit on `/api/storefront/event`. D1 free-tier write quota is the practical ceiling.
- Custom date ranges. v1 has 7d / 30d / 90d toggles.
- Web Pixel Extension (dropped permanently per Amendment 4).

---

## 3. Architecture

### File layout

```
apps/admin/drizzle/
└── migrations/0004_phase_6_analytics.sql       # 3 new tables

apps/admin/drizzle/schema.ts                    # MODIFIED — add events / revenueDaily / bundleDaily

apps/admin/app/lib/analytics/                   # NEW module
├── attribution.ts                              # parse order → ParsedAttribution[]
├── revenue-rollup.ts                           # upsert revenue_daily + bundle_daily
├── events-write.ts                             # insert helper for /api/storefront/event
└── dashboard-query.ts                          # 6 read functions for the dashboard

apps/admin/app/routes/
├── webhooks.orders.paid.tsx                    # NEW — orders/paid handler
├── api.storefront.event.tsx                    # MODIFIED — replace stub with writeStorefrontEvent
└── app._index.tsx                              # MODIFIED — full dashboard

apps/admin/app/components/dashboard/            # NEW directory
├── KpiCard.tsx                                 # 1 of 3 cards (revenue / AOV / conversions)
├── ActivityChart.tsx                           # discounts-applied line chart + bundle filter
├── ConversionsSalesPair.tsx                    # side-by-side conversions + sales charts
├── TopBundlesTable.tsx                         # ranked by revenue
├── QbTierBreakdownTable.tsx                    # per-tier add-count + revenue
└── DateRangePicker.tsx                         # 7d/30d/90d toggle, URL-driven

shopify.app.toml                                # MODIFIED — add orders/paid subscription
```

### Data flow

```
Storefront PDP            Shopify checkout            Merchant admin
     │                          │                          │
     │ sendBeacon               │ orders/paid              │ GET /app
     ▼                          ▼                          ▼
/api/storefront/event   /webhooks/orders/paid       app._index.tsx
     │                          │                          │
     ▼                          ▼                          ▼
events table            revenue_daily upsert       6 parallel queries
                        bundle_daily upsert        ↓
                        shops.attributed_revenue   render charts
```

No cron, no Analytics Engine, no Queues. Each path is synchronous D1 reads/writes.

### Polaris Viz

Charting library: `@shopify/polaris-viz`. Single npm dep added to admin. Provides `<LineChart>`, `<SparkLineChart>`, theming-matching Polaris admin look. Falls back to Recharts only if install hits issues — decided at implementation time, not in this spec.

---

## 4. Schema & data shapes

### D1 migration `0004_phase_6_analytics.sql`

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- 'widget_impression' | 'widget_click' | 'add_to_cart'
  widget_type TEXT NOT NULL,           -- 'bundle' | 'qb' | 'mix_match'
  widget_id TEXT NOT NULL,
  product_id TEXT,
  tier_qty INTEGER,
  value_cents INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL                  -- unix ms
);
CREATE INDEX events_shop_ts_idx ON events(shop_id, ts);
CREATE INDEX events_shop_widget_ts_idx ON events(shop_id, widget_id, ts);

CREATE TABLE revenue_daily (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                  -- YYYY-MM-DD UTC
  total_revenue_cents INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  bundle_revenue_cents INTEGER NOT NULL DEFAULT 0,
  bundle_orders INTEGER NOT NULL DEFAULT 0,
  qb_revenue_cents INTEGER NOT NULL DEFAULT 0,
  qb_orders INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, date)
);

CREATE TABLE bundle_daily (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  bundle_id TEXT NOT NULL,
  widget_type TEXT NOT NULL,           -- 'bundle' | 'qb' | 'mix_match'
  application_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (shop_id, date, bundle_id)
);
CREATE INDEX bundle_daily_shop_date_idx ON bundle_daily(shop_id, date);
```

### Drizzle schema additions

```ts
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["widget_impression", "widget_click", "add_to_cart"] }).notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  widgetId: text("widget_id").notNull(),
  productId: text("product_id"),
  tierQty: integer("tier_qty"),
  valueCents: integer("value_cents").notNull().default(0),
  ts: integer("ts").notNull(),
}, (t) => ({
  shopTsIdx: index("events_shop_ts_idx").on(t.shopId, t.ts),
  shopWidgetTsIdx: index("events_shop_widget_ts_idx").on(t.shopId, t.widgetId, t.ts),
}));

export const revenueDaily = sqliteTable("revenue_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  totalRevenueCents: integer("total_revenue_cents").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
  bundleRevenueCents: integer("bundle_revenue_cents").notNull().default(0),
  bundleOrders: integer("bundle_orders").notNull().default(0),
  qbRevenueCents: integer("qb_revenue_cents").notNull().default(0),
  qbOrders: integer("qb_orders").notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.shopId, t.date] }) }));

export const bundleDaily = sqliteTable("bundle_daily", {
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  bundleId: text("bundle_id").notNull(),
  widgetType: text("widget_type", { enum: ["bundle", "qb", "mix_match"] }).notNull(),
  applicationCount: integer("application_count").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  orders: integer("orders").notNull().default(0),
}, (t) => ({
  pk: primaryKey({ columns: [t.shopId, t.date, t.bundleId] }),
  shopDateIdx: index("bundle_daily_shop_date_idx").on(t.shopId, t.date),
}));
```

### Date semantics

- All `date` columns are `YYYY-MM-DD` strings in **UTC**.
- Order date derived from `order.processed_at` (or `created_at` fallback), converted to UTC, formatted YYYY-MM-DD.
- Dashboard renders dates in merchant's local timezone in tooltips, but UTC date strings drive all aggregation.

### Cleanup

- `events` accumulates indefinitely in v1. 90-day retention sweeper = Phase 8 polish.
- `revenue_daily` and `bundle_daily` are tiny (one row per shop per day, max ~30 rows / shop / month). No cleanup ever.
- `shops` row deletion (uninstall hard delete) cascades through all 3 tables via foreign key.

---

## 5. `orders/paid` webhook + revenue attribution

### Subscription (`shopify.app.toml`)

```toml
  [[webhooks.subscriptions]]
  topics = ["orders/paid"]
  uri = "/webhooks/orders/paid"
```

### Handler (`apps/admin/app/routes/webhooks.orders.paid.tsx`)

Mirrors existing webhooks: HMAC verify via `authenticate.webhook`; idempotency via `wasProcessed` / `markProcessed` (Phase 1 helper, KV with 7-day TTL keyed on `X-Shopify-Webhook-Id`).

### Attribution (`apps/admin/app/lib/analytics/attribution.ts`)

```ts
type ParsedAttribution = {
  bundleId: string;
  widgetType: "bundle" | "qb" | "mix_match";
  revenueCents: number;
  units: number;
};

export async function parseOrderAttribution(
  db: DB,
  shopId: string,
  order: ShopifyOrderPayload,
): Promise<{ totalCents: number; perBundle: ParsedAttribution[] }>;
```

Logic:
1. Walk `order.line_items[]`. For each line, read `properties` for `_pumper_bundle_id`. Skip lines without it.
2. Group lines by `_pumper_bundle_id`. Sum `price_set.shop_money.amount × quantity` per group → revenueCents.
3. For each unique bundle id, look up in D1:
   - `bundles` row → `widgetType = "bundle"` if `mode = "classic"`, else `"mix_match"`
   - `quantity_breaks` row → `widgetType = "qb"`
   - Neither → orphan, skip
4. Total cents = sum across all attributed lines (post-discount line price, not pre-discount catalog price).

### Rollup writer (`apps/admin/app/lib/analytics/revenue-rollup.ts`)

```ts
export async function applyAttribution(
  db: DB,
  shopId: string,
  parsed: { totalCents: number; perBundle: ParsedAttribution[] },
  orderDate: string,  // YYYY-MM-DD UTC
): Promise<void>;
```

Logic:
1. Compute split: `bundleCents` = sum of perBundle entries where widgetType ∈ ('bundle','mix_match'); `qbCents` = sum where widgetType = 'qb'.
2. UPSERT `revenue_daily` for (shopId, orderDate): `total_revenue_cents += totalCents, total_orders += 1, bundle_revenue_cents += bundleCents, bundle_orders += (bundleCents > 0 ? 1 : 0), qb_revenue_cents += qbCents, qb_orders += (qbCents > 0 ? 1 : 0)`. Drizzle `onConflictDoUpdate`.
3. For each unique entry in `parsed.perBundle`, UPSERT `bundle_daily` for (shopId, orderDate, bundleId): `application_count += 1, revenue_cents += entry.revenueCents, orders += 1`.
4. UPDATE `shops.attributed_revenue_cents += totalCents`.

### Mark-processed sequencing

Mark as processed *after* successful D1 write. If write fails → return 500 → Shopify retries → idempotency cache miss → retry succeeds. Marking before write would lose revenue on transient failures.

### Edge cases

| Case | Behavior |
|---|---|
| Order has no `_pumper_bundle_id` lines | Mark processed, return 200, no DB write |
| Bundle id orphan (deleted between cart-add and order paid) | Skip orphan; other lines still attributed |
| `processed_at` missing | Fall back to `created_at`; then to webhook receive time |
| HMAC fail | 401 |
| Duplicate webhook delivery | Idempotency check returns 200 immediately |
| D1 write fails | 500 → Shopify retries → idempotency replays |
| Refunded order | Out of scope; v1 overstates net revenue |
| Multi-currency | Stored in primary-currency cents; presentment currency ignored |

### Tests (`apps/admin/test/analytics-attribution.test.ts`, `analytics-revenue-rollup.test.ts`, `webhooks-orders-paid.test.ts`)

- Single-bundle order → 1 entry, correct revenue.
- Bundle + QB mixed order → 2 entries with correct widgetType split.
- Order without `_pumper_bundle_id` lines → empty perBundle, totalCents = 0.
- Order with deleted bundle → orphan skipped.
- UPSERT new day creates row.
- UPSERT same day increments.
- Multi-bundle order splits across `bundle_daily` rows correctly.
- `shops.attributed_revenue_cents` bumps.
- HMAC fail → 401, no DB write.
- Idempotency: second delivery is no-op.
- Mark-processed only after write.

---

## 6. Storefront event endpoint write path

### Insert helper (`apps/admin/app/lib/analytics/events-write.ts`)

```ts
export async function writeStorefrontEvent(
  db: DB,
  shopId: string,
  event: {
    type: "widget_impression" | "widget_click" | "add_to_cart";
    widgetType: "bundle" | "qb" | "mix_match";
    widgetId: string;
    productId?: string;
    tierQty?: number;
    valueCents?: number;
    ts: number;
  },
): Promise<void>;
```

Inserts a row into `events` with `id = crypto.randomUUID()`. Coerces missing optionals to null/0. Returns void; failures swallowed by caller.

### Updated route (`apps/admin/app/routes/api.storefront.event.tsx`)

Phase 4 structure stays: CORS allow-all, 4096-byte body cap, JSON parse, shop-installed gate, OPTIONS → 204. Replace the no-op block with:

```ts
try {
  await writeStorefrontEvent(db, shop, normalizedEvent);
} catch (err) {
  // Fire-and-forget; never block the storefront on a beacon write
  console.warn("[event-write] failed:", err);
}
return new Response(null, { status: 204, headers: CORS_HEADERS });
```

### Validation (added)

- `type` ∈ {widget_impression, widget_click, add_to_cart} → else silent 204
- `widgetType` ∈ {bundle, qb, mix_match} → else silent 204
- `widgetId` is non-empty string → else silent 204
- `ts` is a finite number → else default to `Date.now()`

### Cleanup on uninstall

`shops.id` ON DELETE CASCADE on `events.shop_id` handles uninstall cleanup automatically. No code needed.

### Tests (`apps/admin/test/analytics-events-write.test.ts`)

- Valid event → row appears in events table with correct shape
- Invalid type → silent drop, no DB row
- Shop not installed → silent drop
- ts missing → fills with Date.now()

---

## 7. Dashboard queries

Single module: `apps/admin/app/lib/analytics/dashboard-query.ts`. All 6 helpers below run in parallel from the dashboard loader.

```ts
type DateRange = { startDate: string; endDate: string };  // YYYY-MM-DD

// 1
export async function getKpis(db: DB, shopId: string, range: DateRange): Promise<{
  totalRevenueCents: number;
  totalOrders: number;
  bundleOrders: number;
  revenueSeries: Array<{ date: string; cents: number }>;
  ordersSeries: Array<{ date: string; count: number }>;
}>;

// 2
export async function getActivitySeries(
  db: DB, shopId: string, range: DateRange, bundleIds?: string[]
): Promise<Array<{ date: string; count: number; perBundle: Record<string, number> }>>;

// 3
export async function getConversionsAndSales(db: DB, shopId: string, range: DateRange): Promise<{
  conversions: Array<{ date: string; bundleOrders: number; qbOrders: number }>;
  sales: Array<{ date: string; bundleCents: number; qbCents: number }>;
}>;

// 4
export async function getTopBundles(db: DB, shopId: string, range: DateRange): Promise<Array<{
  bundleId: string;
  widgetType: "bundle" | "qb" | "mix_match";
  name: string;
  revenueCents: number;
  orders: number;
  applicationCount: number;
  conversionRate: number;
}>>;

// 5
export async function getQbTierBreakdown(db: DB, shopId: string, range: DateRange): Promise<Array<{
  qbId: string;
  qbName: string;
  tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }>;
}>>;

// 6
export async function getBundleListForFilter(db: DB, shopId: string): Promise<Array<{
  id: string; name: string; widgetType: "bundle" | "qb" | "mix_match"; status: string;
}>>;
```

### Implementation notes

- KPIs / Activity / Conversions / TopBundles read from `revenue_daily` + `bundle_daily` (tiny tables, sub-millisecond on D1).
- Per-tier breakdown reads from `events` filtered to `widget_type='qb' AND type='add_to_cart'` — uses the `events_shop_widget_ts_idx` composite index. For 90 days × 10k events/day shop = 900k rows scanned at most; D1 handles this fine.
- Top-bundles `name` joins to `bundles` or `quantity_breaks` table; deleted bundle → fallback "(deleted)" string.
- Conversion rate = `orders / applicationCount` per bundle (post-checkout-completion ratio).

### URL state

Dashboard URL: `/app?range=30d&bundles=b1,b2`. Loader parses searchparams into `range` and `bundleIds[]`. Default range = `7d`, default bundles = all.

### Tests (`apps/admin/test/analytics-dashboard-query.test.ts`)

- KPIs return sums for the given range, ignore other shops' data
- Activity filters by `bundleIds[]`
- Top bundles sort by revenue desc; deleted-bundle name fallback
- QB tier breakdown groups events by widgetId+tierQty correctly
- Empty-result graceful fallbacks for shops with no data

---

## 8. Dashboard UI components

### Layout (`app._index.tsx`)

```
Page title: "Analytics"           [DateRangePicker — 7d/30d/90d]
─────────────────────────────────────────────────────────────────
[ Revenue $X ]   [ AOV $Y ]   [ Conversions Z ]    ← 3 KpiCards
─────────────────────────────────────────────────────────────────
Recent activity — Discounts applied
[ ActivityChart line chart ]
[ Bundle filter checkboxes: ☑ All  ☑ Bundle A  ☑ QB B ]
─────────────────────────────────────────────────────────────────
Conversions over time | Sales over time      ← ConversionsSalesPair
[ line chart ]        | [ line chart ]
─────────────────────────────────────────────────────────────────
Top bundles                                   ← TopBundlesTable
  Name              Revenue   Orders   Conv. rate
  Bundle A          $1,234    42       12.3%
  ...
─────────────────────────────────────────────────────────────────
Quantity break tier breakdown                 ← QbTierBreakdownTable
  QB B
    Tier 1 (qty 1)  245 adds  $4,900
    Tier 2 (qty 2)  178 adds  $5,340
  ...
```

### Component signatures

```tsx
// apps/admin/app/components/dashboard/KpiCard.tsx
type KpiCardProps = {
  label: string;
  value: string;                // pre-formatted, e.g. "$1,234.56" or "42"
  series: Array<{ x: string; y: number }>;
  changePct?: number;            // optional vs previous range
};

// apps/admin/app/components/dashboard/ActivityChart.tsx
type ActivityChartProps = {
  series: Array<{ date: string; count: number; perBundle: Record<string, number> }>;
  bundles: Array<{ id: string; name: string; widgetType: string }>;
  selectedBundleIds: string[];
  onChange: (ids: string[]) => void;
};

// apps/admin/app/components/dashboard/ConversionsSalesPair.tsx
type ConversionsSalesPairProps = {
  conversions: Array<{ date: string; bundleOrders: number; qbOrders: number }>;
  sales: Array<{ date: string; bundleCents: number; qbCents: number }>;
  currency: string;
  locale: string;
};

// apps/admin/app/components/dashboard/TopBundlesTable.tsx
type TopBundlesTableProps = {
  rows: Array<{
    bundleId: string; widgetType: string; name: string;
    revenueCents: number; orders: number; applicationCount: number; conversionRate: number;
  }>;
  currency: string;
  locale: string;
};

// apps/admin/app/components/dashboard/QbTierBreakdownTable.tsx
type QbTierBreakdownTableProps = {
  rows: Array<{ qbId: string; qbName: string; tiers: Array<{ qty: number; addCount: number; estimatedRevenueCents: number }> }>;
  currency: string;
  locale: string;
};

// apps/admin/app/components/dashboard/DateRangePicker.tsx
type DateRangePickerProps = {
  value: "7d" | "30d" | "90d";
  onChange: (range: "7d" | "30d" | "90d") => void;
};
```

### URL state

All filters in URL searchparams: `/app?range=30d&bundles=b1,b2`. Components dispatch updates via `useSearchParams()`; loader reads on each navigation. Back-button friendly.

### Empty state

When the shop has no events/orders, loader returns empty arrays. Each component renders inline "No data yet — keep your bundles live and check back tomorrow" message. We never render a "0 USD" zero-line chart (looks broken).

### Currency / locale

Loader includes `shop.currency` and `shop.primaryLocale`. All money formatted via `Intl.NumberFormat(locale, { style: 'currency', currency })`. If null in DB, default "USD" / "en".

### Polaris Viz

`<SparkLineChart>` for KPI cards. `<LineChart>` for Activity / Conversions / Sales charts (3 instances). Polaris `<DataTable>` for Top Bundles + Tier breakdown. Theme matches admin look out of the box.

---

## 9. Error handling & edge cases

### `orders/paid`

| Case | Behavior |
|---|---|
| No `_pumper_bundle_id` lines | 200, no DB write |
| Orphan bundle id | Skip orphan, attribute remaining lines |
| `processed_at` missing | Fall back to `created_at`, then to webhook receive time |
| HMAC fail | 401 |
| Duplicate delivery | Idempotency 200 immediately |
| D1 write fails | 500 (Shopify retries; idempotency replays) |
| Refunded order | Out of scope; v1 overstates net revenue |

### `/api/storefront/event`

| Case | Behavior |
|---|---|
| Body > 4096 bytes | 413 |
| Bad JSON | 400 |
| Shop not installed | 204 silent drop |
| Invalid `type` / `widgetType` / `widgetId` | 204 silent drop |
| D1 insert fails | 204 (never block storefront) |

### Dashboard

| Case | Behavior |
|---|---|
| One query throws | Catch in loader; that section gets empty data; others render normally |
| All queries throw (D1 unreachable) | Loader returns minimal stub; all empty states |
| `shop.currency` / `primaryLocale` null | Defaults "USD" / "en" |

### Multi-currency

Always store in primary currency cents (`shop_money`). Presentment currency ignored. Per-customer-currency analytics = Phase 8.

### Time zones

All aggregation in UTC. Tooltip labels show YYYY-MM-DD UTC. Documented quirk: 11:30 PM Pacific Jan 1 = Jan 2 UTC = bumped under Jan 2.

---

## 10. Testing

### Unit + integration tests (Vitest, plain Node, in-memory SQLite)

| File | Coverage |
|---|---|
| `analytics-attribution.test.ts` | Parse single-bundle / mix / unattributed / orphan / currency math |
| `analytics-revenue-rollup.test.ts` | New-day insert, same-day increment, multi-bundle split, shops counter bump |
| `analytics-events-write.test.ts` | Valid insert, invalid drops, ts fallback |
| `analytics-dashboard-query.test.ts` | All 6 query helpers — KPIs / activity / conversions / top-bundles / tier-breakdown / bundle-list |
| `webhooks-orders-paid.test.ts` | E2E: HMAC + idempotency + full pipeline + error paths |

### Manual gate (post-deploy on dev store)

1. Place a real order on the dev store containing a bundle. `revenue_daily` row appears within 5 seconds.
2. Same order's bundle appears in Top Bundles within 1 dashboard refresh.
3. KPI cards reflect the order.
4. Visit a PDP — `POST /api/storefront/event` returns 204; `events` row appears.
5. Filter Recent Activity to one bundle → chart updates; URL `?bundles=...` reflects state.
6. Range toggle 7d → 30d → 90d updates all charts.
7. Lighthouse on dashboard: Performance ≥ 90.
8. Refund the order — `revenue_daily` does NOT decrement (expected; refund handling = Phase 8).

---

## 11. Out-of-scope reminder

| Feature | Status |
|---|---|
| Analytics Engine + cron pipeline | Replaced with synchronous D1 writes |
| Refund handling | Phase 8 polish |
| Per-customer-currency analytics | Phase 8 |
| 90-day retention sweeper for `events` | Phase 8 |
| Per-shop rate limit on `/api/storefront/event` | Phase 8 |
| Custom date ranges | Phase 8 |
| Web Pixel Extension | Dropped permanently (Amendment 4) |
| Funnel / impression-to-cart conversion | v1 includes click → order ratio only; impression → click ratio = Phase 8 |
