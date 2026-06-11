# QB Editor Redesign — Phase D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-QB "After add to cart" setting (open cart drawer / go to cart / go to checkout) honored by the storefront widget.

**Architecture:** A new `afterAddToCart` text column on `quantity_breaks` (default `"drawer"` = today's behavior) threads admin → storefront-config → widget; `addToCart` gains an `afterAddToCart` opt and redirects accordingly; `render-qb` passes the QB's value.

**Tech Stack:** Drizzle/D1, Remix + Polaris, vanilla-TS widget (vitest). No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-qb-editor-phase-d-after-add-to-cart-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` / `build`; widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build`; migration `pnpm --filter admin exec drizzle-kit generate` + `pnpm --filter admin exec wrangler d1 migrations apply <db> --local`.

**Key facts:**
- `addToCart(bundleId, lines, opts: { timeoutMs? })` in `apps/widget-src/src/add-to-cart.ts`. After a successful POST it awaits a drawer event; if none within timeout → `window.location.href = "/cart"`. Has an early `if (window._pumperPreview) return { ok: true }`.
- `render-qb.ts:472`: `const result = await addToCart(qb.id, lines);`.
- QB write path: `QbInput` (`apps/admin/app/lib/quantity-breaks/validate.ts`), route actions (`app.quantity-breaks.new.tsx` ~line 70 parses `combinable: form.get("combinable") === "on"`), repo (`apps/admin/app/lib/quantity-breaks/repo.ts`).
- storefront-config QB serializer: `buildQb` in `apps/admin/app/lib/storefront-config.ts`.
- Latest migration: `0047_*`. Next: `0048`.

---

## Task 1: Schema column + migration

**Files:**
- Modify: `apps/admin/drizzle/schema.ts`
- Create: `apps/admin/drizzle/migrations/0048_*.sql` (generated)

- [ ] **Step 1: Add the column.** In `apps/admin/drizzle/schema.ts`, in the `quantityBreaks` table, add (near `combinable`):
```ts
  afterAddToCart: text("after_add_to_cart").notNull().default("drawer"),
```

- [ ] **Step 2: Generate the migration.** Run: `pnpm --filter admin exec drizzle-kit generate` — Expected: a new `drizzle/migrations/0048_*.sql` + updated snapshot/`_journal.json`.

- [ ] **Step 3: Inspect the SQL.** Read the generated `0048_*.sql`. Expected: `ALTER TABLE quantity_breaks ADD COLUMN after_add_to_cart text NOT NULL DEFAULT 'drawer';` (a table-rebuild form is also acceptable/D1-safe). If it tries to alter unrelated tables, stop and report.

- [ ] **Step 4: Apply locally.** Run: `pnpm --filter admin exec wrangler d1 migrations apply <db> --local` (use the same db name prior migration commands use; check `package.json`/`wrangler.toml`). Expected: applies the new migration cleanly.

- [ ] **Step 5: Typecheck.** Run: `pnpm --filter admin typecheck` — Expected: clean (the column is now on the inferred type).

- [ ] **Step 6: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/admin/drizzle/migrations
git commit -m "feat(qb): add after_add_to_cart column (default drawer)"
```

---

## Task 2: Widget — addToCart opt + render-qb wiring (TDD)

**Files:**
- Modify: `apps/widget-src/src/add-to-cart.ts`, `apps/widget-src/src/types.ts`, `apps/widget-src/src/render-qb.ts`
- Test: `apps/widget-src/src/add-to-cart.test.ts`

- [ ] **Step 1: Add the widget type.** In `apps/widget-src/src/types.ts`, in `QbConfig`, add:
```ts
  afterAddToCart?: "drawer" | "cart" | "checkout";
```

- [ ] **Step 2: Write failing tests** in `apps/widget-src/src/add-to-cart.test.ts` (mirror the existing tests' `window.location` mock + fetch stub):
```ts
it("redirects to /cart when afterAddToCart is 'cart'", async () => {
  mockFetchOk(); // use the file's existing fetch-ok helper/pattern
  Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  await addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { afterAddToCart: "cart" });
  expect(window.location.href).toBe("/cart");
});
it("redirects to /checkout when afterAddToCart is 'checkout'", async () => {
  mockFetchOk();
  Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  await addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { afterAddToCart: "checkout" });
  expect(window.location.href).toBe("/checkout");
});
```
(Match the file's actual fetch-mock setup — reuse whatever the existing `posts to /cart/add.js` test uses to stub a 200 response.)

- [ ] **Step 3: Run, verify FAIL.** Run: `pnpm --filter widget-src test add-to-cart` — Expected: the two new tests FAIL.

- [ ] **Step 4: Implement in `add-to-cart.ts`.** Change the opts type and add the redirect branch. Update the signature:
```ts
export async function addToCart(
  bundleId: string,
  lines: CartLineInput[],
  opts: { timeoutMs?: number; afterAddToCart?: "drawer" | "cart" | "checkout" } = {},
): Promise<AddResult> {
```
After the `if (!res.ok) { ... }` block (the add succeeded) and BEFORE the drawer-wait (`notifyCartDrawer()` / `await drawerWillOpen`), add an explicit-redirect short-circuit:
```ts
  if (opts.afterAddToCart === "cart" || opts.afterAddToCart === "checkout") {
    document.dispatchEvent(new CustomEvent("cart:refresh"));
    document.dispatchEvent(new CustomEvent("cart:update"));
    window.location.href = opts.afterAddToCart === "checkout" ? "/checkout" : "/cart";
    return { ok: true };
  }
```
Leave the existing drawer-wait-then-`/cart`-fallback as the `"drawer"`/undefined path, unchanged. (The early `window._pumperPreview` no-op return stays at the top, so preview never redirects.)

- [ ] **Step 5: Run, verify PASS.** Run: `pnpm --filter widget-src test add-to-cart` — Expected: all pass (the 2 new + all existing drawer tests).

- [ ] **Step 6: Wire render-qb.** In `apps/widget-src/src/render-qb.ts:472`, change:
```ts
const result = await addToCart(qb.id, lines);
```
to:
```ts
const result = await addToCart(qb.id, lines, { afterAddToCart: qb.afterAddToCart });
```

- [ ] **Step 7: Run widget suite + build.** Run: `pnpm --filter widget-src test && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: all green, clean, build success (copies widget.js/css to extensions + admin/public).

- [ ] **Step 8: Commit (incl. rebuilt assets).**
```bash
git add apps/widget-src/src/add-to-cart.ts apps/widget-src/src/add-to-cart.test.ts apps/widget-src/src/types.ts apps/widget-src/src/render-qb.ts extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): honor per-QB afterAddToCart redirect"
```

---

## Task 3: Admin write/read path + storefront-config (TDD)

**Files:**
- Modify: `apps/admin/app/lib/quantity-breaks/validate.ts`, `apps/admin/app/lib/quantity-breaks/repo.ts`, `apps/admin/app/routes/app.quantity-breaks.new.tsx`, `apps/admin/app/routes/app.quantity-breaks.$id.tsx`, `apps/admin/app/components/QbForm.tsx`, `apps/admin/app/lib/storefront-config.ts`
- Test: `apps/admin/test/quantity-breaks-validate.test.ts`, `apps/admin/test/storefront-config.test.ts`

- [ ] **Step 1: Validate — failing test.** In `quantity-breaks-validate.test.ts`, add a test: a valid input with `afterAddToCart: "checkout"` round-trips; an input with `afterAddToCart: "bogus"` (or missing) normalizes to `"drawer"`. (Mirror the file's existing validate-call shape; add `afterAddToCart` to the input object it builds.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test quantity-breaks-validate` — Expected: FAIL.

- [ ] **Step 3: Implement validate.** In `validate.ts`: add `afterAddToCart: string;` to `QbInput`; in the validator's returned/normalized object, coerce: `afterAddToCart: ["drawer","cart","checkout"].includes(input.afterAddToCart) ? input.afterAddToCart : "drawer"`. (Match how the validator currently shapes its output — if it returns the input fields, add the coercion there.)

- [ ] **Step 4: Run, verify PASS.** Run: `pnpm --filter admin test quantity-breaks-validate` — Expected: pass.

- [ ] **Step 5: Parse in route actions.** In BOTH `app.quantity-breaks.new.tsx` and `app.quantity-breaks.$id.tsx`, in the input object passed to validate/repo, add (next to `combinable`):
```ts
    afterAddToCart: (form.get("afterAddToCart") as string) || "drawer",
```

- [ ] **Step 6: Persist in repo.** In `repo.ts`, ensure create + update write `afterAddToCart`. If they spread the validated input into the insert/update values, confirm the column is included; if they list columns explicitly, add `afterAddToCart: input.afterAddToCart`.

- [ ] **Step 7: storefront-config — failing test.** In `storefront-config.test.ts`, add: seed a QB with `afterAddToCart: "checkout"`; assert `out.quantityBreaks[0].afterAddToCart === "checkout"`. (Mirror existing QB seeding; the seed insert must include the new column or rely on its default.)

- [ ] **Step 8: Run, verify FAIL.** Run: `pnpm --filter admin test storefront-config` — Expected: FAIL.

- [ ] **Step 9: Implement storefront-config.** In `storefront-config.ts` `buildQb` (the QB config object), add: `afterAddToCart: q.afterAddToCart ?? "drawer",`.

- [ ] **Step 10: Run, verify PASS.** Run: `pnpm --filter admin test storefront-config` — Expected: pass.

- [ ] **Step 11: QbForm UI.** In `QbForm.tsx`: add `afterAddToCart: string;` to `QbFormValues` and `afterAddToCart: "drawer",` to `DEFAULTS`; hydrate it in the edit route's `initialValues` (the `$id` page passes the loaded row — add `afterAddToCart: qb.afterAddToCart` there, OR rely on `{ ...DEFAULTS, ...initialValues }`). In the "Settings" `CollapsibleSection`, add a Polaris `Select`:
```tsx
<Select
  label="After add to cart"
  options={[
    { label: "Open cart drawer", value: "drawer" },
    { label: "Go to cart", value: "cart" },
    { label: "Go to checkout", value: "checkout" },
  ]}
  value={values.afterAddToCart}
  onChange={(v) => update("afterAddToCart", v)}
/>
```
and a hidden input near the others: `<input type="hidden" name="afterAddToCart" value={values.afterAddToCart} />`. (`Select` is already imported in QbForm or its children; add to the polaris import if missing.) On the `$id` edit page loader/route, ensure `afterAddToCart` from the DB row is passed into the form's `initialValues`.

- [ ] **Step 12: Full admin suite + typecheck.** Run: `pnpm --filter admin test && pnpm --filter admin typecheck` — Expected: all green, clean.

- [ ] **Step 13: Commit.**
```bash
git add apps/admin/app/lib/quantity-breaks/validate.ts apps/admin/app/lib/quantity-breaks/repo.ts apps/admin/app/routes/app.quantity-breaks.new.tsx apps/admin/app/routes/app.quantity-breaks.\$id.tsx apps/admin/app/components/QbForm.tsx apps/admin/app/lib/storefront-config.ts apps/admin/test/quantity-breaks-validate.test.ts apps/admin/test/storefront-config.test.ts
git commit -m "feat(qb): afterAddToCart write path + storefront-config + Settings UI"
```

---

## Task 4: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Manual.** In a QB editor → Settings, set "After add to cart" = Go to checkout, save; on a dev store add the QB → lands on `/checkout`. "Go to cart" → `/cart`. "Open cart drawer" → drawer opens (unchanged).
- [ ] **Step 4: Deploy (when approved).** Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`. Widget: `pnpm shopify app deploy --force` (render-qb + add-to-cart changed). Migration: `pnpm --filter admin exec wrangler d1 migrations apply <db> --remote`.

---

## Self-review notes
- **Spec coverage:** column + migration (T1), widget opt + render-qb + QbConfig type (T2), validate + actions + repo + storefront-config + QbForm UI (T3), verify+deploy incl. `--remote` migration (T4). All spec sections covered.
- **No regression:** default `"drawer"` (column default + validator coercion + storefront-config `?? "drawer"` + widget default branch); existing add-to-cart drawer tests untouched.
- **Not synced to metafield** — correct (pure storefront behavior; the discount-function doesn't need it).
- **Type consistency:** `afterAddToCart` union `"drawer"|"cart"|"checkout"` consistent across schema (text), `QbInput`, `QbFormValues`, widget `QbConfig`, `addToCart` opts; the redirect short-circuit returns `{ ok: true }` like the rest of the function.
- **Preview-safe:** the `window._pumperPreview` early return stays first, so editing never redirects.
