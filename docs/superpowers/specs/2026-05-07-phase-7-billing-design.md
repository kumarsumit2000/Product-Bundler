# Phase 7: Billing — Design Spec

**Date:** 2026-05-07
**Status:** Draft for review
**Supersedes:** CLAUDE.md §11 (revenue-cap model). This spec uses an order-count + per-order overage model instead.

---

## 1. Goal

Ship a billing system with 4 plan tiers (free/starter/growth/unlimited) priced on monthly order volume with $0.05 per-order overage on paid plans. All paid plans get the same feature set (no Shopify-tier gating). Free plan has a 50-order lifetime cap that gates *new* bundle/QB creation but never disables the storefront widget.

## 2. Plan Structure

| Plan | Price/mo | Order cap | Cap type | Overage | Trial |
|---|---|---|---|---|---|
| Free | $0 | 50 | Lifetime | n/a (gates new creation) | none |
| Starter | $19 | 300 | Monthly | $0.05/order | 7 days |
| Growth | $49 | 1,000 | Monthly | $0.05/order | 7 days |
| Unlimited | $99 | 3,000 | Monthly | $0.05/order | 7 days |

**Decisions locked:**
- Monthly billing only (no annual discount in v1)
- Lazy reset of monthly counter on read (no cron)
- Per-order overage submission via `appUsageRecordCreate` (no batching)

## 3. Architecture

```
orders/paid webhook (existing Phase 6 handler)
  → revenue attribution (existing)
  → incrementOrderCount(shop)
       → lazyResetIfDue: if monthlyOrderResetAt < now, advance & zero counter
       → bump monthlyOrderCount + lifetimeOrderCount atomically
       → if paid plan && overage triggered → submitOverageCharge (waitUntil)

app.billing.tsx (new)
  → POST { planId } → createSubscription → redirect Shopify confirmation URL
  → merchant approves → /app/billing/callback (UX only, sets pending chargeId)
  → Shopify fires app_subscriptions/update webhook → flips plan = source of truth

UsageBanner (new component)
  → loader on app._index, app.bundles._index, app.quantity-breaks._index calls getUsage
  → renders banner at 80% / 100% thresholds, dismissible per session

Free-tier gate (gating.ts)
  → app.bundles.new + app.quantity-breaks.new actions check canCreateNew()
  → blocks creation only; existing widgets keep working
```

**Source of truth for plan state:** the `app_subscriptions/update` webhook. The post-approval redirect (`/app/billing/callback`) is UX-only and sets a pending chargeId; the webhook is what flips `shops.plan`.

## 4. Data Model

### 4.1 Schema additions (apps/admin/drizzle/schema.ts — `shops` table)

```ts
monthlyOrderCount: integer('monthly_order_count').notNull().default(0),
lifetimeOrderCount: integer('lifetime_order_count').notNull().default(0),
monthlyOrderResetAt: integer('monthly_order_reset_at', { mode: 'timestamp' }),
```

Reused existing columns: `plan`, `planActivatedAt`, `trialEndsAt`, `shopifyChargeId`.

No `billingInterval` column — monthly only.

### 4.2 Migration: apps/admin/drizzle/migrations/0005_phase_7_billing.sql

```sql
ALTER TABLE shops ADD COLUMN monthly_order_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN lifetime_order_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN monthly_order_reset_at INTEGER;
```

### 4.3 Reset semantics

- `monthlyOrderResetAt` is set to `planActivatedAt + 30d` when a paid subscription activates.
- Each lazy reset advances `monthlyOrderResetAt` by exactly **30d**, not "now + 30d", so cycle boundaries stay aligned.
- If a shop is dormant and N cycles pass, the reset advances `monthlyOrderResetAt` until it's > now in one update; counter zeroes once.
- `lifetimeOrderCount` is **never** touched by reset — only by increment.
- For free-plan shops, `monthlyOrderResetAt` is null (we only check `lifetimeOrderCount`).

## 5. Module API Surface

### 5.1 apps/admin/app/lib/billing/plans.ts

```ts
export type PlanId = 'free' | 'starter' | 'growth' | 'unlimited';

export type Plan = {
  id: PlanId;
  name: string;
  priceCents: number;
  orderCap: number;
  isLifetimeCap: boolean;
  overageCents: number;
  trialDays: number;
};

export const PLANS: Record<PlanId, Plan> = {
  free:      { id: 'free',      name: 'Free',      priceCents: 0,    orderCap: 50,   isLifetimeCap: true,  overageCents: 0, trialDays: 0 },
  starter:   { id: 'starter',   name: 'Starter',   priceCents: 1900, orderCap: 300,  isLifetimeCap: false, overageCents: 5, trialDays: 7 },
  growth:    { id: 'growth',    name: 'Growth',    priceCents: 4900, orderCap: 1000, isLifetimeCap: false, overageCents: 5, trialDays: 7 },
  unlimited: { id: 'unlimited', name: 'Unlimited', priceCents: 9900, orderCap: 3000, isLifetimeCap: false, overageCents: 5, trialDays: 7 },
};

export function getPlan(id: string): Plan;       // throws on invalid id
export function isPaidPlan(id: PlanId): boolean; // id !== 'free'
```

### 5.2 apps/admin/app/lib/billing/usage.ts

```ts
export type UsageSnapshot = {
  plan: PlanId;
  monthlyOrderCount: number;
  lifetimeOrderCount: number;
  orderCap: number;
  isLifetimeCap: boolean;
  percentUsed: number;       // 0-100+, can exceed 100 on paid plans
  overOnce: boolean;         // percentUsed >= 100
  resetAt: Date | null;      // null on free
};

export function getUsage(db: Db, shop: string): Promise<UsageSnapshot>;

export type IncrementResult = {
  overageOrders: number;     // 1 if this order is over cap on paid plan; else 0
  isOverFreeCap: boolean;
};
export function incrementOrderCount(db: Db, shop: string): Promise<IncrementResult>;

export function lazyResetIfDue(db: Db, shop: string, now: Date): Promise<boolean>;
```

`incrementOrderCount` calls `lazyResetIfDue` first, then bumps both counters in one SQL UPDATE. Returns whether the post-increment count crosses the cap on a paid plan.

### 5.3 apps/admin/app/lib/billing/subscription.ts

```ts
export function createSubscription(
  admin: AdminApiContext,
  shop: string,
  planId: Exclude<PlanId, 'free'>,
  returnUrl: string,
): Promise<{ confirmationUrl: string; chargeId: string }>;

export function cancelSubscription(admin: AdminApiContext, chargeId: string): Promise<void>;

export function submitOverageCharge(
  admin: AdminApiContext,
  chargeId: string,
  overageCents: number,
  description: string,
): Promise<void>;   // errors logged, never thrown — fire-and-forget
```

GraphQL mutations used:
- `appSubscriptionCreate` with `lineItems[{ plan: { appUsagePricingDetails: { cappedAmount, terms }}}]` for usage line + `appRecurringPricingDetails` for base. `cappedAmount` set high (e.g. $10,000) so we never hit Shopify's usage ceiling.
- `appSubscriptionCancel`
- `appUsageRecordCreate` with `subscriptionLineItemId` (resolved from chargeId via `currentAppInstallation.activeSubscriptions`)

### 5.4 apps/admin/app/lib/billing/gating.ts

```ts
export type GateResult = { allowed: true } | { allowed: false; reason: string; upgradeUrl: string };

export function canCreateNew(usage: UsageSnapshot): GateResult;
```

Logic: `usage.plan === 'free' && usage.lifetimeOrderCount >= 50` → blocked. Otherwise allowed.

## 6. UI/UX

### 6.1 apps/admin/app/routes/app.billing.tsx

Top section — current plan card:
- Plan name + price
- Trial countdown (if `trialEndsAt > now`): "Free trial · X days remaining · First charge {date}"
- Progress bar: `monthlyOrderCount / orderCap` (or `lifetimeOrderCount / 50` on free)
- Reset date (paid only): "Resets {date}"

Below — 4 plan cards in `InlineGrid columns={{ xs: 1, md: 4 }}`:
- Plan name + monthly price (large)
- Order cap line
- Overage line ("$0.05 per extra order" / "Lifetime cap — upgrade to continue")
- Same 4 feature bullets across all paid cards: All bundle types · All QB tiers · Free gift + BOGO · Analytics dashboard
- CTA per state:
  - Current: disabled "Current plan"
  - Higher: primary "Upgrade"
  - Lower: plain "Downgrade"
  - Free (when on paid): critical "Cancel subscription"

Footer banner: "Charges appear on your Shopify invoice. 7-day free trial on first paid subscription."

Action handler:
```
POST { planId }
  if planId === current → 400 no-op
  if planId === 'free' && current is paid → cancelSubscription, set plan='free'
  else → createSubscription → redirect confirmationUrl
```

### 6.2 apps/admin/app/routes/app.billing.callback.tsx

Loader handles `?charge_id=...`:
- Persists `shopifyChargeId` to D1 as pending
- Polaris toast "Subscription pending Shopify confirmation"
- Redirect to `/app/billing`

The actual `plan` flip happens via webhook, not here.

### 6.3 apps/admin/app/components/UsageBanner.tsx

| Condition | Tone | Title | CTA |
|---|---|---|---|
| `plan === 'free' && percentUsed >= 100` | critical | "You've hit your free plan limit" | Upgrade → /app/billing |
| paid && `percentUsed >= 100` | warning | "You're past your monthly cap — overage charges active" | View plans |
| `percentUsed >= 80` | warning | "You've used 80% of your monthly orders" | View plans |
| else | hidden | — | — |

Dismissible per session via KV key `dismissed:${shop}:${threshold}` with 24h TTL.

Mounted at top of:
- apps/admin/app/routes/app._index.tsx (dashboard)
- apps/admin/app/routes/app.bundles._index.tsx
- apps/admin/app/routes/app.quantity-breaks._index.tsx

Each loader calls `getUsage(db, shop)` and passes the snapshot.

### 6.4 Free-tier creation gate

When `canCreateNew()` returns `{ allowed: false }`:
- Action returns 403 with `{ error, upgradeUrl }`
- Page renders Polaris `EmptyState`: image, title "Free plan limit reached", body explaining 50-order cap, primary button "Upgrade to create more"
- List pages still render existing bundles/QBs — only creation is gated

Applied in:
- apps/admin/app/routes/app.bundles.new.tsx (action + render)
- apps/admin/app/routes/app.quantity-breaks.new.tsx (action + render)

### 6.5 Nav

Add "Billing" link in apps/admin/app/routes/app.tsx NavMenu, placed after "Settings".

## 7. Webhook Handlers

### 7.1 apps/admin/app/routes/webhooks.app-subscriptions.update.tsx (new)

Standard pattern: HMAC verify → idempotency dedup → handle status:
- `ACTIVE` first time on shop → set `plan` from line items, set `planActivatedAt = now`, set `trialEndsAt = now + 7d` if line item indicates trial, set `monthlyOrderResetAt = now + 30d`, persist `shopifyChargeId`
- `ACTIVE` on subsequent fires (renewal) → no-op
- `CANCELLED` / `EXPIRED` → revert `plan = 'free'`, clear `shopifyChargeId`, clear `monthlyOrderResetAt`, clear `trialEndsAt`
- `FROZEN` (failed payment) → keep `plan` but log warning; UI can surface this later if needed
- Other (`PENDING`, `DECLINED`, `ACCEPTED`) → log only

Webhook subscription added to shopify.app.toml:
```toml
[[webhooks.subscriptions]]
topics = ["app_subscriptions/update"]
uri = "/webhooks/app-subscriptions/update"
```

### 7.2 apps/admin/app/routes/webhooks.orders.paid.tsx (modify)

After existing revenue attribution, add:
```ts
const { overageOrders } = await incrementOrderCount(db, shop);
if (overageOrders > 0) {
  const shopRow = await db.select().from(shops).where(eq(shops.id, shop)).get();
  if (shopRow?.shopifyChargeId) {
    ctx.waitUntil(submitOverageCharge(admin, shopRow.shopifyChargeId, 5, 'Order overage: 1 order @ $0.05'));
  }
}
```

`waitUntil` keeps webhook response under Shopify's 5s SLA while usage charge submits in background.

**Note:** `orders/paid` webhook is currently commented out in shopify.app.toml pending Protected Customer Data approval. Phase 7 code goes in regardless; full activation requires PCD approval.

## 8. Testing Strategy

### 8.1 Unit tests (vitest + in-memory better-sqlite3)

- `lib/billing/plans.test.ts` — `getPlan` lookup, `isPaidPlan` predicate
- `lib/billing/usage.test.ts`:
  - `incrementOrderCount` increments correctly on free vs paid
  - returns `overageOrders: 1` when post-increment crosses cap on paid
  - returns `overageOrders: 0` when still under cap
  - `lazyResetIfDue` advances `monthlyOrderResetAt` by exactly 30d
  - advances multiple cycles in one shot when shop dormant 90+ days
  - no-op when not yet due
  - zeroes `monthlyOrderCount`, never touches `lifetimeOrderCount`
  - `getUsage` returns correct `percentUsed` and `overOnce` for 0%, 79%, 80%, 100%, 150%
- `lib/billing/gating.test.ts`:
  - free + 49 lifetime → allowed
  - free + 50 lifetime → blocked with upgradeUrl
  - any paid plan, any count → allowed
- `lib/billing/subscription.test.ts` — mock Admin GraphQL client, assert correct mutations sent with correct variables. No real network.

### 8.2 Webhook tests

- `webhooks.app-subscriptions.update.test.ts` — HMAC reject, idempotency dedup, status transitions:
  - ACTIVE first time → plan set, trialEndsAt set, monthlyOrderResetAt set
  - ACTIVE second time (renewal) → no state change
  - CANCELLED → plan reverts to free
  - EXPIRED → plan reverts to free
  - FROZEN → plan retained
- `webhooks.orders.paid.test.ts` — extend existing test:
  - `incrementOrderCount` called after revenue attribution
  - `submitOverageCharge` invoked exactly when over cap on paid plan
  - `submitOverageCharge` not invoked when under cap or on free plan

### 8.3 Integration tests

- `app.billing.test.ts` loader — returns correct plan + usage snapshot
- `app.billing.test.ts` action — `planId: free` while on paid → calls cancel; `planId: growth` → returns redirect to confirmationUrl

### 8.4 Manual gate (no automation possible)

Final task in plan. Five checkpoints requiring real dev store + Partner dashboard:

1. Install app on dev store, verify plan defaults to `free`, banner appears at 0/50
2. Trigger a paid order (requires PCD approval for orders/paid), confirm `lifetimeOrderCount` increments
3. Click Upgrade → Starter, approve charge in Shopify, verify webhook flips `plan` to `starter`, trial badge shows
4. Submit `appUsageRecordCreate` in Partners GraphiQL with chargeId, verify on dev store billing page
5. Cancel subscription via Partners dashboard, verify webhook flips back to `free`, banner reappears

## 9. Trial Expiry — No Cron Needed

Shopify handles trial-to-charge transitions internally. We only track `trialEndsAt` for UI display.

- Set `trialEndsAt = planActivatedAt + 7d` when `app_subscriptions/update` flips to ACTIVE first time
- UI: `if (trialEndsAt && trialEndsAt > now) show "X days remaining"`
- After it passes, line disappears on next page load
- First renewal also fires `app_subscriptions/update` (status stays ACTIVE) — we no-op

## 10. File Manifest

**Created:**
- apps/admin/app/lib/billing/plans.ts
- apps/admin/app/lib/billing/usage.ts
- apps/admin/app/lib/billing/subscription.ts
- apps/admin/app/lib/billing/gating.ts
- apps/admin/app/lib/billing/plans.test.ts
- apps/admin/app/lib/billing/usage.test.ts
- apps/admin/app/lib/billing/subscription.test.ts
- apps/admin/app/lib/billing/gating.test.ts
- apps/admin/app/components/UsageBanner.tsx
- apps/admin/app/routes/app.billing.tsx
- apps/admin/app/routes/app.billing.callback.tsx
- apps/admin/app/routes/webhooks.app-subscriptions.update.tsx
- apps/admin/app/routes/webhooks.app-subscriptions.update.test.ts
- apps/admin/drizzle/migrations/0005_phase_7_billing.sql

**Modified:**
- apps/admin/drizzle/schema.ts (add 3 columns to shops)
- apps/admin/app/routes/webhooks.orders.paid.tsx (call incrementOrderCount + submitOverageCharge)
- apps/admin/app/routes/webhooks.orders.paid.test.ts (assert new calls)
- apps/admin/app/routes/app._index.tsx (mount UsageBanner)
- apps/admin/app/routes/app.bundles._index.tsx (mount UsageBanner)
- apps/admin/app/routes/app.quantity-breaks._index.tsx (mount UsageBanner)
- apps/admin/app/routes/app.bundles.new.tsx (gate via canCreateNew)
- apps/admin/app/routes/app.quantity-breaks.new.tsx (gate via canCreateNew)
- apps/admin/app/routes/app.tsx (Billing nav link)
- shopify.app.toml (add app_subscriptions/update subscription)

## 11. Out of Scope for v1

- Annual billing discount (deferred — re-evaluate after first 50 paid signups)
- Cron-based monthly reset (lazy reset is sufficient)
- Batch overage submission (per-order is fine at expected volume)
- Plan recommendation UI ("you'd save $X on Growth")
- FROZEN status surfacing in UI (just logged for now)
- Email notifications on cap thresholds (Polaris banner is enough)

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `submitOverageCharge` fails silently and we lose revenue | Log to Sentry; periodic reconciliation report (manual) |
| Shopify rejects `appSubscriptionCreate` due to scope/config | Test on dev store before merging; documented in manual gate |
| Race on `incrementOrderCount` from concurrent webhooks | Single SQL UPDATE; D1 serializes per-row; idempotency dedup at webhook level catches dupes |
| Merchant cancels mid-cycle, we keep charging overage | `app_subscriptions/update` CANCELLED handler clears `shopifyChargeId`; subsequent overages skip charge |
| `cappedAmount` on usage line item exceeded | Set high ($10,000); above expected volume even for whales |
| Test deps (better-sqlite3 in-memory) drift from D1 SQL dialect | Same risk as Phases 4–6; existing test infra handles ALTER TABLE syntax already |
