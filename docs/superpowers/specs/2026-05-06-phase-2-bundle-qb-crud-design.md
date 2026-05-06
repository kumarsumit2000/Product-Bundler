# Phase 2 — Bundle + Quantity Break CRUD with Metafield Sync

**Date:** 2026-05-06
**Status:** Approved (pending user spec review)
**Depends on:** Phase 0 ([scaffold design](./2026-05-04-phase-0-scaffold-design.md)), Phase 1 ([webhooks design](./2026-05-06-phase-1-webhooks-design.md)), [Group A amendments](./2026-05-04-spec-amendments-group-a.md)
**Estimated duration:** 1.5-2 weeks

---

## 1. Scope & Goal

Build merchant-facing CRUD for both **Bundles** and **Quantity Breaks** in a single phase. Each save:

1. Validates input (pure function).
2. Writes to D1 via repo.
3. Syncs the full `{bundles, quantityBreaks}` JSON to the shop's metafield (`shop.pumper.config`) via Admin GraphQL `metafieldsSet`.
4. Invalidates `SHOP_SETTINGS_CACHE` (`config:${shop}` key) so Phase 4's storefront widget picks up changes within 60s.

This phase deviates from CLAUDE.md §15 (which scopes Phase 2 = Bundles only) by including Quantity Break CRUD in the same phase. Reasoning: 80% of the data model + UI is shared, and Phase 3 (Discount Function) needs both data shapes ready in the metafield.

### In scope

- D1 migration: add `bundles`, `quantity_breaks`, `shop_settings` tables (per CLAUDE.md §5). Add `shopifyShopGid` column to existing `shops` table.
- Admin pages (Polaris):
  - Bundle list, create, edit (3-section single-page form).
  - QB list, create, edit (2-section single-page form).
  - Replace `app._index.tsx` "Hello" stub with a 2-card dashboard linking to Bundles and QB lists.
- App navigation entries via App Bridge `<NavMenu>`: Bundles, Quantity Breaks.
- Shared UI components in `app/components/`:
  - `ProductPicker` (wraps App Bridge `resourcePicker`)
  - `DiscountValueInput` (type-aware $/% input)
  - `StatusBadge` (draft/active/paused Polaris Badge)
  - `BundleForm`, `QbForm`, `QbTierBuilder`
- Pure validation functions in `app/lib/{bundles,quantity-breaks}/validate.ts`.
- Repo layer in `app/lib/{bundles,quantity-breaks}/repo.ts` — multi-tenancy enforced via required `shopId` parameter on every query.
- `app/lib/metafield-sync.ts` — assembles full config + writes via Admin GraphQL.
- KV cache invalidation on every save.

### Out of scope (deferred to later phases)

| Item | Phase |
|---|---|
| Style overrides per bundle/QB (`styleOverrides`) | Phase 4 |
| Custom CSS / `customCss` field | Phase 4 |
| Free gift / BOGO mechanics on QB tiers (`freeGiftVariantId`, `bogoTargetVariantId`) | Phase 5 |
| Collection-based QB (`collectionId`) | Phase 4+ |
| Bulk list-view actions (multi-select pause/activate) | Phase 8 |
| Bundle scheduling (start/end dates) | Never (CLAUDE.md §18) |
| Discount node creation (`discountAutomaticAppCreate` → `shops.shopifyDiscountId`) | Phase 3 |
| Metafield sharding for >64KB configs | Phase 3 Group B |

### Exit criteria (recap from §8)

See "Done Criteria" at the end of this document.

---

## 2. Repo Additions

```
apps/admin/
├── app/
│   ├── routes/
│   │   ├── app._index.tsx                  # MODIFY — replace "Hello" with 2-card dashboard
│   │   ├── app.bundles._index.tsx          # NEW — list view
│   │   ├── app.bundles.new.tsx             # NEW — create form
│   │   ├── app.bundles.$id.tsx             # NEW — edit form (reuses BundleForm)
│   │   ├── app.quantity-breaks._index.tsx  # NEW — list view
│   │   ├── app.quantity-breaks.new.tsx     # NEW — create form
│   │   └── app.quantity-breaks.$id.tsx     # NEW — edit form
│   ├── components/
│   │   ├── ProductPicker.tsx               # NEW
│   │   ├── DiscountValueInput.tsx          # NEW
│   │   ├── StatusBadge.tsx                 # NEW
│   │   ├── BundleForm.tsx                  # NEW
│   │   ├── QbForm.tsx                      # NEW
│   │   └── QbTierBuilder.tsx               # NEW
│   └── lib/
│       ├── bundles/
│       │   ├── repo.ts                     # NEW
│       │   ├── validate.ts                 # NEW
│       ├── quantity-breaks/
│       │   ├── repo.ts                     # NEW
│       │   ├── validate.ts                 # NEW
│       └── metafield-sync.ts               # NEW
└── test/
    ├── bundles-validate.test.ts            # NEW
    ├── bundles-repo.test.ts                # NEW
    ├── quantity-breaks-validate.test.ts    # NEW
    ├── quantity-breaks-repo.test.ts        # NEW
    └── metafield-sync.test.ts              # NEW

drizzle/schema.ts                           # MODIFY — add tables, add shopifyShopGid column
drizzle/migrations/                         # generated SQL for new schema
```

---

## 3. Schema Changes

### 3.1 `bundles` table

Per CLAUDE.md §5 + Amendment 2 (no `shopifyDiscountId` per-bundle):

```ts
export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),                    // ULID
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),  // draft | active | paused
  products: text("products", { mode: "json" }).$type<BundleProduct[]>().notNull(),
  discountType: text("discount_type").notNull(),     // percentage | flat | fixed_total
  discountValue: real("discount_value").notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  triggerProductIds: text("trigger_product_ids", { mode: "json" }).$type<string[]>().notNull(),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  headline: text("headline"),
  ctaLabel: text("cta_label"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("bundles_shop_idx").on(t.shopId),
  statusIdx: index("bundles_status_idx").on(t.shopId, t.status),
}));
```

### 3.2 `quantity_breaks` table

```ts
export const quantityBreaks = sqliteTable("quantity_breaks", {
  id: text("id").primaryKey(),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  productId: text("product_id").notNull(),
  collectionId: text("collection_id"),               // unused in Phase 2
  tiers: text("tiers", { mode: "json" }).$type<QbTier[]>().notNull(),
  combinable: integer("combinable", { mode: "boolean" }).notNull().default(false),
  styleOverrides: text("style_overrides", { mode: "json" }).$type<StyleOverrides | null>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  shopIdx: index("qb_shop_idx").on(t.shopId),
  productIdx: index("qb_product_idx").on(t.shopId, t.productId),
}));
```

### 3.3 `shop_settings` table

```ts
export const shopSettings = sqliteTable("shop_settings", {
  shopId: text("shop_id").primaryKey().references(() => shops.id, { onDelete: "cascade" }),
  primaryColor: text("primary_color").notNull().default("#7B1E2A"),
  textColor: text("text_color").notNull().default("#1A1A1A"),
  backgroundColor: text("background_color").notNull().default("#FFFFFF"),
  borderRadius: integer("border_radius").notNull().default(8),
  fontFamily: text("font_family").notNull().default("inherit"),
  bundleHeadline: text("bundle_headline").notNull().default("Frequently bought together"),
  qbHeadline: text("qb_headline").notNull().default("Choose your savings"),
  showCompareAtPrice: integer("show_compare_at_price", { mode: "boolean" }).notNull().default(true),
  enableBOGO: integer("enable_bogo", { mode: "boolean" }).notNull().default(true),
  customCss: text("custom_css"),
});
```

Phase 2 migrates the table but writes no rows. Defaults take effect when Phase 4 reads it. The "when does first row get inserted?" question is Phase 4's concern.

### 3.4 `shops` table change

Add `shopifyShopGid` column to existing `shops` table:

```ts
shopifyShopGid: text("shopify_shop_gid"),  // gid://shopify/Shop/<numeric-id>; lazily resolved on first metafield sync
```

Existing rows from Phase 0 install get `NULL` until first sync. The sync helper queries `shop { id }` and updates this column when first needed.

### 3.5 Type aliases

`BundleProduct`, `QbTier`, `StyleOverrides` are defined in CLAUDE.md §5 — verbatim copy:

```ts
export type BundleProduct = {
  productId: string;        // gid://shopify/Product/...
  variantId: string | null; // null = "all variants"
  qty: number;
};

export type QbTier = {
  qty: number;
  discountType: "percentage" | "flat" | "fixed_per_unit";
  discountValue: number;
  label: string;
  isMostPopular: boolean;
  freeGiftVariantId?: string;   // unused in Phase 2 (Phase 5)
  bogoTargetVariantId?: string; // unused in Phase 2 (Phase 5)
};

export type StyleOverrides = Partial<{
  primaryColor: string;
  textColor: string;
  backgroundColor: string;
  borderRadius: number;
}>;
```

---

## 4. Repository Layer

### 4.1 `app/lib/bundles/repo.ts`

```ts
import { and, eq, desc } from "drizzle-orm";
import type { DB } from "~/db.server";
import { schema } from "~/db.server";

export async function listByShop(db: DB, shopId: string) {
  return db
    .select()
    .from(schema.bundles)
    .where(eq(schema.bundles.shopId, shopId))
    .orderBy(desc(schema.bundles.updatedAt));
}

export async function getById(db: DB, shopId: string, id: string) {
  const rows = await db
    .select()
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function create(db: DB, shopId: string, input: NewBundle) {
  const id = crypto.randomUUID();  // or ULID — see decision below
  const now = new Date();
  const row = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.bundles).values(row);
  return row;
}

export async function update(db: DB, shopId: string, id: string, patch: Partial<NewBundle>) {
  const now = new Date();
  await db
    .update(schema.bundles)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)));
  return getById(db, shopId, id);
}
```

### 4.2 `app/lib/quantity-breaks/repo.ts`

Same pattern. Functions: `listByShop`, `getById`, `create`, `update`.

### 4.3 ID generation: `crypto.randomUUID()` vs ULID

CLAUDE.md §5 says "ULID" but the Cloudflare Workers runtime has `crypto.randomUUID()` natively (UUIDv4). ULID requires a small library (~1KB) but provides lexical-sort-by-time which is nice for list queries.

**Decision:** Use `crypto.randomUUID()` for v1. UUIDs are 36 chars, ULIDs are 26 chars — saves a few bytes per row but not enough to matter. Add ULID library later if listing performance needs sort optimization.

### 4.4 Multi-tenancy enforcement

Every repo function takes `shopId: string` as a required parameter and includes it in all WHERE clauses. No "global queries" possible. This prevents cross-shop data leaks at the data layer — even if a route bug forgets to authenticate, the repo refuses to operate without a shopId.

---

## 5. Validation Layer

### 5.1 Bundle validation rules

`app/lib/bundles/validate.ts`:

```ts
type ValidationResult = { valid: true } | { valid: false; errors: Record<string, string> };

export function validateBundle(input: BundleInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name?.trim()) errors.name = "Name is required";
  if (input.name && input.name.length > 100) errors.name = "Name must be 100 characters or less";

  if (!Array.isArray(input.products) || input.products.length < 2) {
    errors.products = "Bundle must have at least 2 products";
  }
  for (const p of input.products ?? []) {
    if (!p.productId) errors.products = "Each product must have a product ID";
    if (typeof p.qty !== "number" || p.qty < 1 || p.qty > 100) {
      errors.products = "Quantity must be between 1 and 100";
    }
  }

  if (!["percentage", "flat", "fixed_total"].includes(input.discountType)) {
    errors.discountType = "Invalid discount type";
  }
  if (typeof input.discountValue !== "number" || input.discountValue <= 0) {
    errors.discountValue = "Discount value must be positive";
  }
  if (input.discountType === "percentage" && input.discountValue > 100) {
    errors.discountValue = "Percentage cannot exceed 100";
  }

  if (input.triggerProductIds && !Array.isArray(input.triggerProductIds)) {
    errors.triggerProductIds = "Trigger products must be a list";
  }

  if (!["draft", "active", "paused"].includes(input.status)) {
    errors.status = "Invalid status";
  }

  return Object.keys(errors).length === 0 ? { valid: true } : { valid: false, errors };
}
```

### 5.2 QB validation rules

`app/lib/quantity-breaks/validate.ts`:

- `name` required, ≤100 chars
- `productId` required (non-empty string)
- `tiers` length 1-10
- Each tier: `qty` integer ≥1
- Tiers must have ascending `qty` (no duplicates, no descending)
- Each tier: `discountType` valid; `discountValue > 0`; if percentage, ≤100
- At most one tier with `isMostPopular: true`
- `status` ∈ {draft, active, paused}

### 5.3 Validation failure UX

Routes use the errors object to populate Polaris UI:
- Top-of-form `<Banner status="critical">` with summary "Fix these issues to save the bundle".
- Inline errors on `<TextField error={errors.name} />`, etc.
- Form remembers user input on validation failure (re-renders with FormData values).

---

## 6. Metafield Sync

### 6.1 `app/lib/metafield-sync.ts`

```ts
import type { DB } from "~/db.server";
import * as bundleRepo from "./bundles/repo";
import * as qbRepo from "./quantity-breaks/repo";

const MAX_BYTES = 50_000;  // 14KB headroom under 64KB Shopify limit

type AdminGraphqlClient = {
  graphql(query: string, options?: { variables?: unknown }): Promise<Response>;
};

export async function syncShopConfig(
  db: DB,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<void> {
  const [bundles, qbs] = await Promise.all([
    bundleRepo.listByShop(db, shopId),
    qbRepo.listByShop(db, shopId),
  ]);

  const config = {
    schemaVersion: 1,
    bundles: bundles.map(toPublicBundle),
    quantityBreaks: qbs.map(toPublicQb),
  };
  const json = JSON.stringify(config);

  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_BYTES) {
    throw new Error(
      `Config JSON is ${bytes} bytes; exceeds ${MAX_BYTES}-byte safety limit. ` +
      `Sharding not yet implemented (Phase 3 Group B). Reduce bundles or QBs and try again.`,
    );
  }

  // Resolve shop GID — lazy fetch + cache
  const shopGid = await getOrFetchShopGid(db, admin, shopId);

  await admin.graphql(
    `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: shopGid,
          namespace: "pumper",
          key: "config",
          type: "json",
          value: json,
        }],
      },
    },
  );
}

function toPublicBundle(row: Bundle) {
  // Drop internal columns (createdAt/updatedAt). Keep public surface for Function consumption.
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    products: row.products,
    discountType: row.discountType,
    discountValue: row.discountValue,
    combinable: row.combinable,
    triggerProductIds: row.triggerProductIds,
  };
}

// toPublicQb similar
```

### 6.2 Shop GID resolution

```ts
async function getOrFetchShopGid(
  db: DB,
  admin: AdminGraphqlClient,
  shopId: string,
): Promise<string> {
  const shopRow = (await db.select().from(schema.shops).where(eq(schema.shops.id, shopId)))[0];
  if (shopRow?.shopifyShopGid) return shopRow.shopifyShopGid;

  const res = await admin.graphql(`query { shop { id } }`);
  const data = await res.json();
  const gid = data.data.shop.id;

  await db
    .update(schema.shops)
    .set({ shopifyShopGid: gid })
    .where(eq(schema.shops.id, shopId));

  return gid;
}
```

### 6.3 KV cache invalidation

Caller (the route action) is responsible:

```ts
await syncShopConfig(db, admin, shopId);
await ctx.cloudflare.env.SHOP_SETTINGS_CACHE.delete(`config:${shopId}`);
```

Phase 4's `/api/storefront/config/:shop` endpoint reads from this cache. Deletion forces re-fetch within a 60s TTL window.

---

## 7. UI Patterns

### 7.1 Single-page form (decided over multi-step wizard)

All form fields visible on one scrollable page, grouped into Polaris `Card`s with section headers ("1. Products", "2. Discount", "3. Trigger products"). Single Save button at bottom validates everything at once. Reasoning: simpler than a stepper, matches Polaris conventions, fewer clicks.

### 7.2 Bundle form layout

```
Card 1: Products in this bundle
  - Name (TextField)
  - Product list (each row: thumbnail + title + variant dropdown + qty stepper + delete)
  - "Add product" button → opens ResourcePicker (multi-select)
  - Validation: ≥2 products; min qty 1, max 100

Card 2: Discount
  - Discount type radio: Percentage / Flat / Fixed total
  - Discount value (input changes per type — % suffix, $ prefix)
  - Combinable checkbox

Card 3: Trigger products (which PDPs show this bundle)
  - Radio: "Same as bundle members" (default) / "Choose specific products"
  - When "specific": product picker (single-select per row, multi-row)

Card 4: Settings
  - Status radio: Draft / Active / Paused (default Draft on new)
  - Headline (optional TextField, max 100 chars)
  - CTA label (optional TextField, max 50 chars)

[Cancel]                                         [Save bundle]
```

### 7.3 QB form layout

```
Card 1: Product
  - Name (TextField)
  - Single product picker (uses ResourcePicker, single-select)

Card 2: Tiers
  - QbTierBuilder component:
    - Each row: qty / discount type / discount value / label / popular checkbox
    - "Add tier" button (max 10)
    - Drag to reorder (Phase 2 stretch — defer if complex)
  - Validation: tiers in ascending qty order, ≤10, max 1 popular

Card 3: Settings
  - Status radio
  - Combinable checkbox

[Cancel]                              [Save quantity break]
```

### 7.4 List view layout (both Bundles and QB)

Polaris `IndexTable` with columns:
- Name (clickable → edit)
- Status badge
- Discount summary ("20% off" / "$5 off" / "Tiered: 1/2/3")
- Updated date
- [Edit] action

Empty state: large Polaris `EmptyState` card with illustration, "No bundles yet" / "No quantity breaks yet", primary action button "Create bundle" / "Create quantity break".

### 7.5 Dashboard (`app._index.tsx`)

Replace current "Hello, {shop}" content with two `MediaCard`s side by side:

```
┌─ Bundles ─────────────┐  ┌─ Quantity Breaks ─────┐
│ Group products to sell│  │ Tiered pricing for    │
│ together at a discount│  │ a single product      │
│ [View bundles] →      │  │ [View quantity breaks]→│
└───────────────────────┘  └───────────────────────┘

(Phase 6+: Revenue dashboard goes here)
```

### 7.6 App navigation

`app.tsx` adds App Bridge `<NavMenu>` (or `<ui-nav-menu>` web component) with three entries:

```tsx
<NavMenu>
  <Link to="/app">Dashboard</Link>
  <Link to="/app/bundles">Bundles</Link>
  <Link to="/app/quantity-breaks">Quantity Breaks</Link>
</NavMenu>
```

---

## 8. Done Criteria

- [ ] D1 migration applied (local + remote): `bundles`, `quantity_breaks`, `shop_settings` tables exist; `shops.shopifyShopGid` column added.
- [ ] All Phase 2 routes implemented and `pnpm typecheck` clean.
- [ ] Bundle CRUD end-to-end on dev store: create bundle with 2 products → list shows it → edit changes discount → save → metafield query returns updated config.
- [ ] QB CRUD end-to-end: create QB with 3 tiers → list shows it → edit adjusts tier values → save → metafield reflects.
- [ ] Status transitions work: bundle/QB starts as Draft, can be moved to Active or Paused via edit form. List view badges update.
- [ ] App navigation has Dashboard, Bundles, Quantity Breaks entries via NavMenu.
- [ ] Empty states render when no bundles/QBs exist.
- [ ] All ~34 new tests pass; full suite at 67/67 (33 prior + 34 new).
- [ ] Metafield sync: after each save, `query { shop { metafield(namespace: "pumper", key: "config") { value } } }` returns valid JSON containing the saved entity.
- [ ] `shopifyShopGid` populated on `shops` row after first sync.
- [ ] KV `config:${shop}` deleted after each save (verified manually).
- [ ] Production deploy succeeds; smoke test on `bundler.deepseatools.in` passes.
- [ ] Phase 2 design + plan committed; tag `phase-2-complete` pushed.

---

## 9. Risks & Contingencies

### Risk 1: App Bridge `resourcePicker` API differences

We're on App Bridge React v4 (Phase 0). Confirm `useAppBridge().resourcePicker(opts)` returns `Promise<{selection: [...]}>` with the expected `selection[i].id` and `selection[i].variants[]` shape. If different, adapt `ProductPicker` accordingly.

### Risk 2: Metafield 50KB safety limit

Hard fail at 50KB forces sharding before user-facing breakage. Probability of hitting it in Phase 2 testing: ~zero (only 1-3 entities). Probability in production at scale: medium for whales. Mitigation: Phase 3 Group B sharding work.

### Risk 3: Drizzle migration with foreign keys + cascade on D1

D1 is SQLite — supports `ON DELETE CASCADE` at the SQL level. Drizzle's `onDelete: "cascade"` translates correctly. But need to verify the migration enables `PRAGMA foreign_keys = ON` (D1 does by default, but worth confirming). If a `shop/redact` doesn't cascade-delete bundles, fix the migration.

### Risk 4: QB tier reordering by drag

Polaris doesn't have a built-in drag-and-drop. Implementing it adds complexity. Phase 2 defers reordering; merchants delete + re-add tiers if order is wrong (low frequency operation).

### Risk 5: Concurrent saves race on metafield

Two saves in quick succession from the same merchant (e.g., double-click) → both read DB at the same point, both write metafield → last write wins, possibly with stale data.
- Probability: medium.
- Mitigation: Polaris button auto-disables during submit. Optimistic locking deferred to Phase 8.

---

## 10. Test Coverage Plan

| Test file | Tests |
|---|---|
| `bundles-validate.test.ts` | ~10 |
| `bundles-repo.test.ts` | ~6 |
| `quantity-breaks-validate.test.ts` | ~8 |
| `quantity-breaks-repo.test.ts` | ~5 |
| `metafield-sync.test.ts` | ~5 |

Polaris component tests (ProductPicker, BundleForm, etc.) deferred to Phase 8 — rendering Polaris in isolation requires extra setup (AppProvider, App Bridge mock) that adds maintenance cost. Manual smoke testing covers the UI layer in Phase 2.

Total: +34 tests. End of Phase 2: 67 tests passing.

---

## 11. What Phase 2 Does NOT Include

- Storefront widget (`/api/storefront/config/:shop` endpoint, theme app extension) — Phase 4.
- Discount Function logic (Rust) — Phase 3.
- Discount node creation via `discountAutomaticAppCreate` — Phase 3 (creates one node per shop on first save during Phase 3).
- Free gift / BOGO mechanics — Phase 5.
- Style customization UI — Phase 4.
- Analytics / revenue tracking — Phase 6.
- Billing — Phase 7.
