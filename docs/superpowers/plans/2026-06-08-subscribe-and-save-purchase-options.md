# Subscribe & Save (Purchase Options) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a merchant's third-party selling plans as a per-offer "Purchase Options / Subscribe & Save" block on Quantity Break, Bundle, and BXGY widgets, attaching the chosen `selling_plan` to the cart line.

**Architecture:** We run no billing. Shopify (via the merchant's subscription app) already attaches selling plans to products; `app-embed.liquid` exposes them, a shared widget module renders a One-time/Subscribe toggle, and `add-to-cart` adds `items[i][selling_plan]`. A new per-offer `subscription` JSON column stores display/copy config only.

**Tech Stack:** Remix + Drizzle (D1/SQLite), Cloudflare Pages, vanilla-TS widget (tsup), Polaris admin, vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-subscribe-and-save-purchase-options-design.md`

**Commands:**
- Admin tests: `pnpm --filter admin test` · Admin typecheck: `pnpm --filter admin typecheck`
- Widget tests: `pnpm --filter widget-src test` · Widget typecheck: `pnpm --filter widget-src typecheck`
- Widget build: `pnpm --filter widget-src build`
- Apply migration (local): `cd apps/admin && pnpm db:migrate:local`

---

## Task 1: Schema — re-add `subscription` column + type

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0047_subscription_purchase_options.sql`
- Modify: `apps/admin/drizzle/migrations/meta/_journal.json`

- [ ] **Step 1: Add the type** to `apps/admin/drizzle/schema.ts` just above `StickyAtcConfig`:

```ts
export type SubscriptionConfig = {
  enabled: boolean;
  heading: string;            // "Purchase Options"
  title: string;              // "Subscribe & Save"
  subtitle: string;           // "Cancel anytime"
  details: string;            // "Enjoy flexible billing & discounts"
  widgetStyle: "modern" | "classic";
  showDiscountLabel: boolean;
  hideThirdPartyWidget: boolean;
};
```

- [ ] **Step 2: Add the column** to all three tables. In `bundles` (after `freeGiftProductId`), in `quantityBreaks` (after `ctaLabel`), and in `bxgyOffers` (find a nullable JSON column like `styleOverrides` and add alongside):

```ts
  subscription: text("subscription", { mode: "json" }).$type<SubscriptionConfig | null>(),
```

- [ ] **Step 3: Write the migration** `0047_subscription_purchase_options.sql`:

```sql
-- Subscribe & Save: per-offer display/config for surfacing third-party
-- selling plans. JSON shape SubscriptionConfig (NOT the removed intent shape).
ALTER TABLE bundles ADD COLUMN subscription text;
--> statement-breakpoint
ALTER TABLE quantity_breaks ADD COLUMN subscription text;
--> statement-breakpoint
ALTER TABLE bxgy_offers ADD COLUMN subscription text;
```

- [ ] **Step 4: Append journal entry.** Run:

```bash
cd "apps/admin" && python3 -c "
import json
p='drizzle/migrations/meta/_journal.json'
j=json.load(open(p)); last=j['entries'][-1]
j['entries'].append({'idx':47,'version':last['version'],'when':last['when']+1200000,'tag':'0047_subscription_purchase_options','breakpoints':True})
json.dump(j,open(p,'w'),indent=2); print('ok', last['tag'])
"
```
Expected: `ok 0046_drop_subscription`

- [ ] **Step 5: Apply + typecheck.** Run: `cd apps/admin && pnpm db:migrate:local && pnpm typecheck`
Expected: migration `0047` shows ✅; typecheck clean.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations/0047_subscription_purchase_options.sql apps/admin/drizzle/migrations/meta/_journal.json
git commit -m "feat(schema): re-add subscription column as purchase-options config"
```

---

## Task 2: `parse-subscription.ts` (form → SubscriptionConfig)

**Files:**
- Create: `apps/admin/app/lib/parse-subscription.ts`
- Test: `apps/admin/test/parse-subscription.test.ts`

- [ ] **Step 1: Write the failing test** `apps/admin/test/parse-subscription.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSubscriptionForm, EMPTY_SUBSCRIPTION } from "../app/lib/parse-subscription";

describe("parseSubscriptionForm", () => {
  it("returns null for null/empty input", () => {
    expect(parseSubscriptionForm(null)).toBeNull();
    expect(parseSubscriptionForm("")).toBeNull();
  });

  it("round-trips a valid config", () => {
    const raw = JSON.stringify({ ...EMPTY_SUBSCRIPTION, enabled: true, title: "Subscribe & Save" });
    expect(parseSubscriptionForm(raw)).toEqual({ ...EMPTY_SUBSCRIPTION, enabled: true, title: "Subscribe & Save" });
  });

  it("coerces an invalid widgetStyle to 'modern' and fills missing copy from defaults", () => {
    const raw = JSON.stringify({ enabled: true, widgetStyle: "bogus" });
    const out = parseSubscriptionForm(raw)!;
    expect(out.widgetStyle).toBe("modern");
    expect(out.heading).toBe(EMPTY_SUBSCRIPTION.heading);
  });

  it("returns null for malformed JSON", () => {
    expect(parseSubscriptionForm("{not json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter admin test parse-subscription`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `apps/admin/app/lib/parse-subscription.ts`:

```ts
import type { SubscriptionConfig } from "../../drizzle/schema";

export const EMPTY_SUBSCRIPTION: SubscriptionConfig = {
  enabled: false,
  heading: "Purchase Options",
  title: "Subscribe & Save",
  subtitle: "Cancel anytime",
  details: "Enjoy flexible billing & discounts",
  widgetStyle: "modern",
  showDiscountLabel: true,
  hideThirdPartyWidget: false,
};

const STYLES: SubscriptionConfig["widgetStyle"][] = ["modern", "classic"];

// Reads the `subscription` form field (JSON written by SubscriptionPanel) and
// returns a typed SubscriptionConfig or null. Unknown/missing fields fall back
// to EMPTY_SUBSCRIPTION; malformed JSON returns null.
export function parseSubscriptionForm(raw: FormDataEntryValue | null): SubscriptionConfig | null {
  if (raw == null || raw === "" || raw === "null") return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const str = (k: keyof SubscriptionConfig) =>
    typeof obj[k] === "string" ? (obj[k] as string) : (EMPTY_SUBSCRIPTION[k] as string);
  const bool = (k: keyof SubscriptionConfig) =>
    typeof obj[k] === "boolean" ? (obj[k] as boolean) : (EMPTY_SUBSCRIPTION[k] as boolean);
  return {
    enabled: bool("enabled"),
    heading: str("heading"),
    title: str("title"),
    subtitle: str("subtitle"),
    details: str("details"),
    widgetStyle: STYLES.includes(obj.widgetStyle as never) ? (obj.widgetStyle as SubscriptionConfig["widgetStyle"]) : "modern",
    showDiscountLabel: bool("showDiscountLabel"),
    hideThirdPartyWidget: bool("hideThirdPartyWidget"),
  };
}
```

- [ ] **Step 4: Run tests, verify pass.** Run: `pnpm --filter admin test parse-subscription` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/parse-subscription.ts apps/admin/test/parse-subscription.test.ts
git commit -m "feat(admin): parse-subscription form parser with defaults + clamping"
```

---

## Task 3: Validation input types accept `subscription`

**Files:**
- Modify: `apps/admin/app/lib/bundles/validate.ts`
- Modify: `apps/admin/app/lib/quantity-breaks/validate.ts`
- Modify: `apps/admin/app/lib/bxgy-offers/repo.ts` (CreateBxgyInput / UpdateBxgyPatch types)

- [ ] **Step 1: Add to the bundles validate input type.** In `apps/admin/app/lib/bundles/validate.ts`, after the `freeGiftProductId?` field of the input type, add:

```ts
  subscription: import("../../drizzle/schema").SubscriptionConfig | null;
```
(If the file already imports from the schema at top, use a top-level `import type { SubscriptionConfig }` instead and reference `subscription: SubscriptionConfig | null;`.)

- [ ] **Step 2: Add to the quantity-breaks validate input type** in `apps/admin/app/lib/quantity-breaks/validate.ts`, after `textOverrides`:

```ts
  subscription: import("../../drizzle/schema").SubscriptionConfig | null;
```

- [ ] **Step 3: Add to BXGY create/update types.** In `apps/admin/app/lib/bxgy-offers/repo.ts`, add `subscription: SubscriptionConfig | null` to `CreateBxgyInput` and `subscription?: SubscriptionConfig | null` to `UpdateBxgyPatch` (import the type from `../../drizzle/schema`), and ensure the drizzle `insert(...).values({...})` and `update(...).set({...})` objects include `subscription: input.subscription ?? null` / `patch.subscription` (mirror the existing nullable JSON field such as `styleOverrides`).

- [ ] **Step 4: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean (the routes don't pass `subscription` yet — if TS complains about a missing required field, make the field `subscription?: ... | null` optional in the validate input types instead).

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/bundles/validate.ts apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/app/lib/bxgy-offers/repo.ts
git commit -m "feat(admin): thread subscription through validate + bxgy repo types"
```

---

## Task 4: storefront-config serializes `subscription`

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts`
- Test: `apps/admin/test/storefront-config-subscription.test.ts` (or extend an existing storefront-config test if present)

- [ ] **Step 1: Write the failing test** `apps/admin/test/storefront-config-subscription.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { serializeQbForWidget } from "../app/lib/storefront-config";

// NOTE: adjust the import to the actual exported serializer used for QB rows.
// If serialization is not individually exported, assert via the higher-level
// buildStorefrontConfig with a stubbed db row instead.
describe("storefront-config subscription", () => {
  it("passes through an enabled subscription config on a QB", () => {
    const sub = { enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
      subtitle: "Cancel anytime", details: "x", widgetStyle: "modern" as const,
      showDiscountLabel: true, hideThirdPartyWidget: false };
    const row: any = { id: "q1", tiers: [], headline: null, ctaLabel: null, subscription: sub };
    const out = serializeQbForWidget(row, {} as any);
    expect(out.subscription).toEqual(sub);
  });
});
```
(If `storefront-config.ts` has no per-row exported function, first extract the QB mapping into an exported `serializeQbForWidget(row, ctx)` as part of this task, then test it. Keep the extraction minimal.)

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter admin test storefront-config-subscription` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `apps/admin/app/lib/storefront-config.ts`, add `subscription: q.subscription ?? null,` to the QB mapped object (near `ctaLabel`), `subscription: b.subscription ?? null,` to the bundle mapped object, and `subscription: o.subscription ?? null,` to the BXGY mapped object. (These restore the lines removed in migration 0046, plus BXGY which is new.)

- [ ] **Step 4: Run tests.** Run: `pnpm --filter admin test storefront-config-subscription` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/test/storefront-config-subscription.test.ts
git commit -m "feat(config): serialize per-offer subscription into storefront config"
```

---

## Task 5: Widget types — SubscriptionConfig, selling plans

**Files:**
- Modify: `apps/widget-src/src/types.ts`

- [ ] **Step 1: Add types** to `apps/widget-src/src/types.ts` (near the old `SubscriptionConfig` location, now removed):

```ts
export type SubscriptionConfig = {
  enabled: boolean;
  heading: string;
  title: string;
  subtitle: string;
  details: string;
  widgetStyle: "modern" | "classic";
  showDiscountLabel: boolean;
  hideThirdPartyWidget: boolean;
};

export type SellingPlanAllocation = { planId: string; priceCents: number };
export type SellingPlanGroup = { id: string; name: string; plans: { id: string; name: string }[] };
```

- [ ] **Step 2: Add `subscription?` to the QB, Bundle, and BXGY config types** (where the old `subscription?: SubscriptionConfig | null` props were removed in migration 0046, restore on all three):

```ts
  subscription?: SubscriptionConfig | null;
```

- [ ] **Step 3: Add selling-plan fields.** On the product-variant config type, add `sellingPlanAllocations?: SellingPlanAllocation[]`. On the `Window["_pumperConfig"]` interface, add `sellingPlanGroups?: SellingPlanGroup[]`.

- [ ] **Step 4: Typecheck.** Run: `pnpm --filter widget-src typecheck` — Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/widget-src/src/types.ts
git commit -m "feat(widget): subscription + selling-plan types"
```

---

## Task 6: add-to-cart attaches `selling_plan`

**Files:**
- Modify: `apps/widget-src/src/add-to-cart.ts:3-9` (CartLineInput) and the FormData builder (~line 54)
- Test: `apps/widget-src/src/add-to-cart.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — add to `apps/widget-src/src/add-to-cart.test.ts`:

```ts
it("appends items[i][selling_plan] when sellingPlanId is set", async () => {
  const calls: FormData[] = [];
  const fetchMock = vi.fn(async (_url: string, init: any) => {
    calls.push(init.body as FormData);
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  await addToCart("b1", [{ variantId: "gid://shopify/ProductVariant/42", qty: 2, sellingPlanId: "gid://shopify/SellingPlan/7" }], { timeoutMs: 0 });
  const body = calls[0];
  expect(body.get("items[0][selling_plan]")).toBe("7");
  expect(body.get("items[0][id]")).toBe("42");
});
```
(Match the existing test file's import of `addToCart` and any `vi`/`vitest` setup already present.)

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter widget-src test add-to-cart` — Expected: FAIL (no selling_plan key).

- [ ] **Step 3: Implement.** In `apps/widget-src/src/add-to-cart.ts`, add `sellingPlanId?: string;` to `CartLineInput`. In the FormData loop (after the `quantity` append, before properties), add:

```ts
    if (l.sellingPlanId) {
      formData.append(`items[${i}][selling_plan]`, toCartVariantId(l.sellingPlanId));
    }
```
(`toCartVariantId` already strips the `gid://shopify/.../<n>` prefix to the numeric id.)

- [ ] **Step 4: Run tests.** Run: `pnpm --filter widget-src test add-to-cart` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/widget-src/src/add-to-cart.ts apps/widget-src/src/add-to-cart.test.ts
git commit -m "feat(widget): attach selling_plan to cart line when set"
```

---

## Task 7: `renderPurchaseOptions` module

**Files:**
- Create: `apps/widget-src/src/render-purchase-options.ts`
- Test: `apps/widget-src/src/render-purchase-options.test.ts`

- [ ] **Step 1: Write the failing test** `apps/widget-src/src/render-purchase-options.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createPurchaseOptions } from "./render-purchase-options";
import type { SubscriptionConfig, SellingPlanGroup, SellingPlanAllocation } from "./types";

const cfg: SubscriptionConfig = {
  enabled: true, heading: "Purchase Options", title: "Subscribe & Save",
  subtitle: "Cancel anytime", details: "x", widgetStyle: "modern",
  showDiscountLabel: true, hideThirdPartyWidget: false,
};
const groups: SellingPlanGroup[] = [{ id: "g1", name: "Subscribe", plans: [{ id: "gid://shopify/SellingPlan/7", name: "Monthly" }] }];
const allocs: SellingPlanAllocation[] = [{ planId: "gid://shopify/SellingPlan/7", priceCents: 2246 }];

describe("createPurchaseOptions", () => {
  let mount: HTMLElement;
  beforeEach(() => { mount = document.createElement("div"); document.body.appendChild(mount); });

  it("defaults to one-time selection (no selling plan)", () => {
    const po = createPurchaseOptions(mount, cfg, { groups, allocations: allocs, oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    expect(po.getSelection()).toEqual({ mode: "onetime", sellingPlanId: null });
  });

  it("returns the selling plan id after selecting subscribe", () => {
    const po = createPurchaseOptions(mount, cfg, { groups, allocations: allocs, oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    (mount.querySelector('[data-po-mode="subscribe"]') as HTMLElement).click();
    expect(po.getSelection()).toEqual({ mode: "subscribe", sellingPlanId: "gid://shopify/SellingPlan/7" });
  });

  it("renders nothing and reports inactive when there are no selling plans", () => {
    const po = createPurchaseOptions(mount, cfg, { groups: [], allocations: [], oneTimePriceCents: 2495, currency: "USD", locale: "en" });
    expect(po.active).toBe(false);
    expect(mount.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter widget-src test render-purchase-options` — Expected: FAIL.

- [ ] **Step 3: Implement** `apps/widget-src/src/render-purchase-options.ts`:

```ts
import type { SubscriptionConfig, SellingPlanGroup, SellingPlanAllocation } from "./types";
import { formatMoney } from "./format"; // existing money formatter; adjust import name if different

export type PurchaseSelection = { mode: "onetime" | "subscribe"; sellingPlanId: string | null };
export type PurchaseOptionsCtx = {
  groups: SellingPlanGroup[];
  allocations: SellingPlanAllocation[];
  oneTimePriceCents: number;
  currency: string;
  locale: string;
};
export type PurchaseOptions = { active: boolean; getSelection: () => PurchaseSelection };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Renders a One-time / Subscribe toggle from existing selling plans. If the
// product has no selling plans, renders nothing and reports active=false so the
// host widget falls back to one-time only.
export function createPurchaseOptions(mount: HTMLElement, cfg: SubscriptionConfig, ctx: PurchaseOptionsCtx): PurchaseOptions {
  const plans = ctx.groups.flatMap((g) => g.plans);
  if (!cfg.enabled || plans.length === 0 || ctx.allocations.length === 0) {
    return { active: false, getSelection: () => ({ mode: "onetime", sellingPlanId: null }) };
  }
  let selectedPlanId = plans[0]!.id;
  let mode: PurchaseSelection["mode"] = "onetime";

  const subPrice = (planId: string) => ctx.allocations.find((a) => a.planId === planId)?.priceCents ?? ctx.oneTimePriceCents;
  const discountLabel = (planId: string) => {
    const sp = subPrice(planId);
    if (!cfg.showDiscountLabel || sp >= ctx.oneTimePriceCents) return "";
    const pct = Math.round((1 - sp / ctx.oneTimePriceCents) * 100);
    return `<span class="pumper-po-save">Save ${pct}%</span>`;
  };

  const render = () => {
    const planOptions = plans.length > 1
      ? `<select class="pumper-po-plan">${plans.map((p) => `<option value="${esc(p.id)}"${p.id === selectedPlanId ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`
      : "";
    mount.innerHTML = `
      <div class="pumper-po pumper-po-${cfg.widgetStyle}">
        <div class="pumper-po-heading">${esc(cfg.heading)}</div>
        <label class="pumper-po-row" data-po-mode="onetime" aria-selected="${mode === "onetime"}">
          <input type="radio" name="pumper-po" ${mode === "onetime" ? "checked" : ""} />
          <span class="pumper-po-onetime">One-time purchase</span>
          <span class="pumper-po-price">${formatMoney(ctx.oneTimePriceCents, ctx.currency, ctx.locale)}</span>
        </label>
        <label class="pumper-po-row" data-po-mode="subscribe" aria-selected="${mode === "subscribe"}">
          <input type="radio" name="pumper-po" ${mode === "subscribe" ? "checked" : ""} />
          <span class="pumper-po-title">${esc(cfg.title)} ${discountLabel(selectedPlanId)}</span>
          <span class="pumper-po-subtitle">${esc(cfg.subtitle)}</span>
          <span class="pumper-po-price">${formatMoney(subPrice(selectedPlanId), ctx.currency, ctx.locale)}</span>
          ${mode === "subscribe" ? planOptions : ""}
          ${mode === "subscribe" && cfg.details ? `<span class="pumper-po-details">${esc(cfg.details)}</span>` : ""}
        </label>
      </div>`;
    mount.querySelector('[data-po-mode="onetime"]')!.addEventListener("click", () => { mode = "onetime"; render(); });
    mount.querySelector('[data-po-mode="subscribe"]')!.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("pumper-po-plan")) return;
      mode = "subscribe"; render();
    });
    const sel = mount.querySelector<HTMLSelectElement>(".pumper-po-plan");
    sel?.addEventListener("change", () => { selectedPlanId = sel.value; render(); });
  };
  render();

  return { active: true, getSelection: () => ({ mode, sellingPlanId: mode === "subscribe" ? selectedPlanId : null }) };
}
```
(If `formatMoney`'s name/signature differs, match the one used in `render-qb.ts`.)

- [ ] **Step 4: Run tests.** Run: `pnpm --filter widget-src test render-purchase-options` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/widget-src/src/render-purchase-options.ts apps/widget-src/src/render-purchase-options.test.ts
git commit -m "feat(widget): shared renderPurchaseOptions module"
```

---

## Task 8: Wire purchase options into render-qb / render-bundle / render-bxgy

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`, `render-bundle.ts`, `render-bxgy.ts`
- Test: `apps/widget-src/src/render-qb.test.ts` (extend)

- [ ] **Step 1: Write the failing test** in `render-qb.test.ts` — assert that when the QB has an enabled subscription and the product has a selling plan allocation, adding to cart with the subscribe option selected attaches the selling plan. Model it on the existing render-qb add-to-cart test (reuse its DOM + fetch-mock setup):

```ts
it("attaches selling_plan to the primary line when subscribe is selected", async () => {
  // ...render QB with subscription.enabled and variant.sellingPlanAllocations...
  // click the tier, click [data-po-mode="subscribe"], click the CTA
  // assert the fetched FormData has items[0][selling_plan] === "<numeric>"
});
```
(Fill the setup by copying the nearest existing "add to cart" test in this file and adding `subscription` to the qb fixture + `sellingPlanAllocations` to the variant + `sellingPlanGroups` to `_pumperConfig`.)

- [ ] **Step 2: Run it, verify it fails.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 3: Implement in `render-qb.ts`.** After the tier UI is built and before/around the CTA, mount a purchase-options container and create the controller:

```ts
import { createPurchaseOptions } from "./render-purchase-options";
// ...
let purchaseOptions = { active: false, getSelection: () => ({ mode: "onetime", sellingPlanId: null as string | null }) };
if (qb.subscription?.enabled) {
  const poMount = document.createElement("div");
  el.appendChild(poMount); // place under the tiers (match existing layout container)
  purchaseOptions = createPurchaseOptions(poMount, qb.subscription, {
    groups: window._pumperConfig?.sellingPlanGroups ?? [],
    allocations: variant.sellingPlanAllocations ?? [],
    oneTimePriceCents: /* the selected tier's primary unit price in cents */ tierUnitPriceCents,
    currency: config.settings.currency,
    locale: config.settings.locale,
  });
}
```
Then where the primary line is pushed (`{ variantId: variant.variantId, qty: tr.qty, bundleId: qb.id }`), add the selling plan:

```ts
const sel = purchaseOptions.getSelection();
const lines: CartLineInput[] = [
  { variantId: variant.variantId, qty: tr.qty, bundleId: qb.id, sellingPlanId: sel.sellingPlanId ?? undefined },
];
```
Free-gift / BOGO lines stay one-time (do **not** set sellingPlanId on them).

- [ ] **Step 4: Mirror in `render-bundle.ts` and `render-bxgy.ts`.** Same pattern: if `cfg.subscription?.enabled`, mount the controller, and set `sellingPlanId` on the **primary purchasable line(s)** only (not gifts). For bundles, apply to each bundle component line; for BXGY apply to the "buy" line(s).

- [ ] **Step 5: Run tests + typecheck.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck` — Expected: PASS + clean.

- [ ] **Step 6: Commit.**

```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-bundle.ts apps/widget-src/src/render-bxgy.ts apps/widget-src/src/render-qb.test.ts
git commit -m "feat(widget): render purchase options + attach selling plan in qb/bundle/bxgy"
```

---

## Task 9: Expose selling plans in `app-embed.liquid`

**Files:**
- Modify: `extensions/theme-app-extension/blocks/app-embed.liquid`

- [ ] **Step 1: Add selling-plan groups** to the `_pumperConfig` object:

```liquid
    requiresSellingPlan: {{ product.requires_selling_plan | json }},
    sellingPlanGroups: [
      {% for g in product.selling_plan_groups %}
      { id: "{{ g.id }}", name: {{ g.name | json }}, plans: [
        {% for p in g.selling_plans %}{ id: "gid://shopify/SellingPlan/{{ p.id }}", name: {{ p.name | json }} }{% unless forloop.last %},{% endunless %}{% endfor %}
      ] }{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ],
```

- [ ] **Step 2: Add per-variant allocations.** Inside the existing `productVariants` `{% for v in product.variants %}` loop object, add:

```liquid
        sellingPlanAllocations: [
          {% for a in v.selling_plan_allocations %}{ planId: "gid://shopify/SellingPlan/{{ a.selling_plan.id }}", priceCents: {{ a.per_delivery_price | default: a.price }} }{% unless forloop.last %},{% endunless %}{% endfor %}
        ],
```
(`a.price` / `a.per_delivery_price` are already in cents in Liquid.)

- [ ] **Step 3: Verify Liquid is syntactically valid** by checking the file renders no `{% %}` mismatch (visual review — Liquid has no local compiler here). Confirm the JSON object commas are correct.

- [ ] **Step 4: Commit.**

```bash
git add extensions/theme-app-extension/blocks/app-embed.liquid
git commit -m "feat(theme): expose selling plan groups + variant allocations to widget"
```

---

## Task 10: `SubscriptionPanel` admin component + wire into forms

**Files:**
- Create: `apps/admin/app/components/SubscriptionPanel.tsx`
- Modify: `apps/admin/app/components/QbForm.tsx`, `BundleForm.tsx`, `BxgyForm.tsx`

- [ ] **Step 1: Implement** `apps/admin/app/components/SubscriptionPanel.tsx` (Polaris card mirroring the reference): props `{ value: SubscriptionConfig; onChange: (v: SubscriptionConfig) => void }`. Fields: header `Subscription` with an enable `Switch`/`Checkbox`; two info `Banner`s ("Subscription app discounts are applied first…" and "Subscription settings should be set in a third-party subscription app."); `Select` Widget Style (Modern/Classic); `TextField` Purchase Options Heading; `TextField` Subscription Title; `TextField` Subscription Subtitle; `TextField` Subscription Details; `Checkbox` "Show subscription discount label"; `Checkbox` "Hide third party subscription Widget". Export `EMPTY_SUBSCRIPTION` re-exported from `~/lib/parse-subscription` for the default. Follow the structure of an existing panel like `WidgetAddonsCard.tsx`.

- [ ] **Step 2: Wire into each form.** In `QbForm.tsx`, `BundleForm.tsx`, `BxgyForm.tsx`: add `subscription: SubscriptionConfig` to the form values state (default `EMPTY_SUBSCRIPTION` or the loaded value), render `<SubscriptionPanel value={values.subscription} onChange={(v) => update("subscription", v)} />` in the form body, and add a hidden input serializing it:

```tsx
<input type="hidden" name="subscription" value={JSON.stringify(values.subscription)} />
```

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/app/components/SubscriptionPanel.tsx apps/admin/app/components/QbForm.tsx apps/admin/app/components/BundleForm.tsx apps/admin/app/components/BxgyForm.tsx
git commit -m "feat(admin): SubscriptionPanel + wire into qb/bundle/bxgy forms"
```

---

## Task 11: Parse `subscription` in the 6 create/edit routes

**Files:**
- Modify: `app.bundles.new.tsx`, `app.bundles.$id.tsx`, `app.quantity-breaks.new.tsx`, `app.quantity-breaks.$id.tsx`, `app.bxgy-offers.new.tsx`, `app.bxgy-offers.$id.tsx`

- [ ] **Step 1: In each route action**, import the parser and set the field on the input passed to validate/repo:

```ts
import { parseSubscriptionForm } from "~/lib/parse-subscription";
// ...inside the action, in the input object:
  subscription: parseSubscriptionForm(form.get("subscription")),
```
For quantity-breaks, also add `subscription: input.subscription,` where the validated input is mapped into the repo create/update object (mirror how the other fields like `textOverrides` are passed). For BXGY, add it to the object passed to `bxgyRepo.create/update`.

- [ ] **Step 2: Also load existing value into the form** on the edit (`$id`) routes — the loader already returns the row; ensure `BxgyForm`/`QbForm`/`BundleForm` receives `subscription: row.subscription ?? EMPTY_SUBSCRIPTION` as the initial value.

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean + all pass.

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/app/routes/app.bundles.new.tsx apps/admin/app/routes/app.bundles.\$id.tsx apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx apps/admin/app/routes/app.bxgy-offers.new.tsx apps/admin/app/routes/app.bxgy-offers.\$id.tsx
git commit -m "feat(admin): persist subscription config from qb/bundle/bxgy forms"
```

---

## Task 12: Preview threads subscription + mock selling plan

**Files:**
- Modify: `apps/admin/app/lib/preview-config.ts`

- [ ] **Step 1: Thread `subscription`** into the preview payload for QB / bundle / BXGY entries (same shape as storefront-config).

- [ ] **Step 2: Inject a mock selling plan** so the Subscribe option always renders in preview: set the preview `_pumperConfig.sellingPlanGroups` to `[{ id: "preview", name: "Subscribe", plans: [{ id: "gid://shopify/SellingPlan/0", name: "Every month" }] }]` and give each preview variant `sellingPlanAllocations: [{ planId: "gid://shopify/SellingPlan/0", priceCents: Math.round(oneTime * 0.9) }]` (10% off) when the entry's `subscription.enabled`.

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 4: Commit.**

```bash
git add apps/admin/app/lib/preview-config.ts
git commit -m "feat(admin): preview renders subscribe option via mock selling plan"
```

---

## Task 13: Dashboard "Subscribe & Save" template card

**Files:**
- Modify: `apps/admin/app/routes/app._index.tsx`
- Modify: `apps/admin/app/lib/template-presets.ts`

- [ ] **Step 1: Add a preset** `qb_subscribe` in `template-presets.ts` that prefills a Quantity Break with two tiers (1 Pack, 2 Packs at e.g. 20% off) and `subscription: { ...EMPTY_SUBSCRIPTION, enabled: true }`.

- [ ] **Step 2: Add the card** to the `CARDS` array in `app._index.tsx`:

```ts
  { key: "qb_subscribe", title: "Subscribe & Save", href: "/app/quantity-breaks/new", preview: PreviewQbSubscribe },
```
and add a small `PreviewQbSubscribe` preview component (copy the structure of `PreviewQbSame` and add a "Subscribe & Save" row).

- [ ] **Step 3: Verify the new form reads the preset.** Confirm `/app/quantity-breaks/new` applies the `qb_subscribe` preset (same mechanism the other `qb_*` presets use).

- [ ] **Step 4: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/app/routes/app._index.tsx apps/admin/app/lib/template-presets.ts
git commit -m "feat(admin): Subscribe & Save dashboard template (qb preset)"
```

---

## Task 14: `hideThirdPartyWidget` (best-effort) + widget CSS

**Files:**
- Modify: `apps/widget-src/src/render-purchase-options.ts` (or a small helper) + `apps/widget-src/src/widget.css`-equivalent (the widget styles file)

- [ ] **Step 1: Add a hide helper.** When any rendered offer has `subscription.hideThirdPartyWidget`, hide known third-party subscription widgets by selector. Add a small function called once after render:

```ts
const THIRD_PARTY_SUB_SELECTORS = [
  "[data-subscription-widget]", ".rc_widget", ".shopify-subscription-widget",
  ".seal-subscription-widget", ".appstle_subscription_wrapper",
];
export function hideThirdPartySubscriptionWidgets() {
  for (const sel of THIRD_PARTY_SUB_SELECTORS) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => { el.style.display = "none"; });
  }
}
```
Call it from the host widget when `subscription?.hideThirdPartyWidget` is true.

- [ ] **Step 2: Add purchase-options CSS** for `.pumper-po`, `.pumper-po-row`, `.pumper-po-save`, modern/classic variants in the widget stylesheet (match existing widget class style conventions). Reserve min-height to keep CLS = 0.

- [ ] **Step 3: Build the widget.** Run: `pnpm --filter widget-src build` — Expected: build success, bundle within budget (note the size printed).

- [ ] **Step 4: Commit.**

```bash
git add apps/widget-src/src/render-purchase-options.ts apps/widget-src/src/widget.css extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): hide third-party subscription widgets + purchase-options styles"
```

---

## Task 15: Full verification

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean + all green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean + green + build success.
- [ ] **Step 3: Grep sweep.** Run: `grep -rniE "subscription" apps extensions --include=*.ts --include=*.tsx --include=*.liquid | grep -viE "app.?subscription|billing"` — Expected: only the new purchase-options references, no stragglers.
- [ ] **Step 4: Manual (dev store).** With a subscription app + a selling plan on a product: enable Subscription on a QB, load the PDP, confirm the One-time/Subscribe toggle shows the discounted subscribe price; select Subscribe + Add to cart; confirm the cart line carries the selling plan (Shopify cart shows the subscription). Also confirm: product with NO selling plan hides the block; preview shows the block via the mock plan.
- [ ] **Step 5: Deploy (when approved).** `pnpm --filter admin build && cd apps/admin && pnpm run deploy && pnpm db:migrate:prod`.

---

## Self-Review notes

- **Spec coverage:** data model (T1), liquid selling plans (T9), shared render module (T7) + wiring (T8), add-to-cart (T6), admin panel (T10) + routes (T11), storefront-config (T4), preview + mock plan (T12), standalone preset card (T13), error handling — no-plans hides block (T7 test) / preview mock (T12), hideThirdPartyWidget (T14), tests (each task) — all covered.
- **Known constraint** (selling plans from current PDP product only) is inherent to T9 (Liquid sees only `product`); no task attempts cross-product plans — consistent with spec "out of scope".
- **Type consistency:** `SubscriptionConfig` identical in schema (T1) and widget types (T5); `createPurchaseOptions` / `getSelection` / `PurchaseSelection` names consistent T7↔T8; `sellingPlanAllocations` / `sellingPlanGroups` names consistent T5/T9/T7.
