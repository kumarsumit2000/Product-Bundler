# QB Editor Redesign — Phase D: "After add to cart" redirect

**Date:** 2026-06-11
**Status:** Approved design, ready for implementation planning
**Part of:** the QB editor redesign — the final phase. Phases A, B1–B4, C1–C3 shipped. The QB "Settings" section already covers most Pumper Advanced Settings (combinable, scheduling, priority, visibility, sticky bar, status); this fills the one genuine behavioral gap.

## Context

The widget's `addToCart` (`apps/widget-src/src/add-to-cart.ts`) posts to `/cart/add.js`, then: if a theme cart-drawer event fires within a timeout it stays (drawer opens); otherwise it falls back to `window.location.href = "/cart"`. The merchant has no control. Pumper lets them choose what happens after add-to-cart: open the drawer (stay), go to cart, or go to checkout.

`addToCart(bundleId, lines, opts: { timeoutMs? })` is called from `render-qb.ts:472` as `addToCart(qb.id, lines)`. QB plumbing for a scalar field is established: `QbInput` (validate.ts) → route action `form.get(...)` (mirrors `combinable` at `app.quantity-breaks.new.tsx:70`) → repo → storefront-config QB serializer → widget `QbConfig`. Latest migration is `0047`; this adds `0048`.

## Goal

A per-QB "After add to cart" setting — **open cart drawer / go to cart / go to checkout** — honored by the widget. Default preserves today's behavior (no regression).

## Decisions (approved)
- **Per-QB** setting (lives in the QB Settings section), values `"drawer" | "cart" | "checkout"`, default `"drawer"`.
- `"drawer"` = exactly today's behavior (drawer-or-`/cart` fallback). QB-only (bundles/BXGY unchanged).

## Data model
Add to `quantityBreaks` (`apps/admin/drizzle/schema.ts`):
```ts
  afterAddToCart: text("after_add_to_cart").notNull().default("drawer"),
```
Generate a migration via `pnpm --filter admin exec drizzle-kit generate` → `drizzle/migrations/0048_*.sql` (expected: `ALTER TABLE quantity_breaks ADD COLUMN after_add_to_cart text NOT NULL DEFAULT 'drawer'`). Apply local with `wrangler d1 migrations apply <db> --local`, `--remote` at deploy.

## Components

### 1. Admin write path
- **`apps/admin/app/lib/quantity-breaks/validate.ts`** — add `afterAddToCart: string` to `QbInput`; in the validator, coerce to one of `"drawer"|"cart"|"checkout"`, defaulting to `"drawer"` on any other value.
- **route actions** (`app.quantity-breaks.new.tsx`, `app.quantity-breaks.$id.tsx`) — parse `afterAddToCart: (form.get("afterAddToCart") as string) || "drawer"` (mirror the `combinable`/`status` parsing).
- **`apps/admin/app/lib/quantity-breaks/repo.ts`** — persist `afterAddToCart` on create/update (it mostly spreads the validated input; ensure the column is written).
- **`QbForm.tsx`** — in the "Settings" `CollapsibleSection`, add a Polaris `Select` "After add to cart" (options: `{label:"Open cart drawer", value:"drawer"}`, `{label:"Go to cart", value:"cart"}`, `{label:"Go to checkout", value:"checkout"}`) bound to a new `afterAddToCart` form value (default `"drawer"`) + a hidden `<input name="afterAddToCart">`. Add `afterAddToCart: string` to `QbFormValues` + `"drawer"` to `DEFAULTS`, and hydrate it from the loaded row on the edit page.

### 2. storefront-config — `apps/admin/app/lib/storefront-config.ts`
In the QB config object (the `buildQb`/QB serializer), add `afterAddToCart: q.afterAddToCart ?? "drawer"`.

### 3. Widget
- **`apps/widget-src/src/types.ts`** `QbConfig` — add `afterAddToCart?: "drawer" | "cart" | "checkout"`.
- **`apps/widget-src/src/add-to-cart.ts`** — extend `opts` with `afterAddToCart?: "drawer" | "cart" | "checkout"`. After a successful add:
  - `"cart"` → `window.location.href = "/cart"` and return (skip the drawer-wait).
  - `"checkout"` → `window.location.href = "/checkout"` and return.
  - `"drawer"` / undefined → the existing drawer-wait-then-`/cart`-fallback logic, unchanged.
  Keep the early `window._pumperPreview` no-op return at the top (no redirect in admin preview).
- **`apps/widget-src/src/render-qb.ts:472`** — pass the QB's setting: `addToCart(qb.id, lines, { afterAddToCart: qb.afterAddToCart })`.

## Data flow
QB `afterAddToCart` → DB column → storefront-config → widget `QbConfig` → `render-qb` passes to `addToCart` → redirect. (Not synced to the discount-function metafield — pure storefront behavior.)

## Error handling / edge cases
- Unknown/missing value anywhere coerces to `"drawer"` (validator + storefront-config `?? "drawer"` + widget default branch) → never a broken redirect.
- Admin preview iframe (`window._pumperPreview`) still no-ops first — no redirect while editing.
- `"cart"`/`"checkout"` skip the drawer-open wait entirely (an explicit redirect shouldn't wait on a drawer that may also fire).
- Existing QBs (pre-migration) get `"drawer"` via the column default → identical current behavior.

## Testing
- **Widget (TDD):** `addToCart(..., { afterAddToCart: "cart" })` → `location.href === "/cart"`; `"checkout"` → `/checkout`; absent/`"drawer"` → existing behavior (current add-to-cart tests stay green); a `render-qb` test asserting the QB's `afterAddToCart` is passed into `addToCart` (spy/module mock, matching the file's existing test style).
- **Admin (TDD):** validate coerces unknown → `"drawer"` and round-trips a valid value; repo create/update persists it; storefront-config carries `afterAddToCart`.
- **Regression:** existing 246 admin + 124 widget tests stay green; migration applies cleanly local; typechecks + builds clean.
- **Manual (dev store):** set a QB to "Go to checkout" → adding lands on `/checkout`; "Go to cart" → `/cart`; "Open cart drawer" → drawer opens as before.

## Out of scope
A shop-wide default; applying the setting to bundle/BXGY widgets (QB-only for now); a "stay on page, no drawer, no redirect" option (the three Pumper options suffice).
