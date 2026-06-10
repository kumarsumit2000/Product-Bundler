# QB Editor Redesign — Phase B2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-tier **image** and **free shipping** to Quantity Breaks, surface free gift + image + free shipping as Add-On chips in the tier editor, render them in the widget, and grant free shipping at checkout via the Rust shipping function when the active tier has `freeShipping`.

**Architecture:** Two new optional `QbTier` JSON fields (`image`, `freeShipping`) thread admin → DB → storefront-config (widget display) and → metafield-sync (`freeShipping` only, for functions). The widget renders the image + a free-ship badge. The Rust `shipping-discount-function` is extended to read cart lines and grant free shipping when an active QB tier has `freeShipping` (unioned with the existing progressive-gift subtotal rule).

**Tech Stack:** Remix + Polaris + Drizzle, vanilla-TS widget (tsup/vitest), Rust (`shopify_function`, wasm). No new deps.

**Spec:** `docs/superpowers/specs/2026-06-10-qb-editor-phase-b2-per-tier-addons-design.md`

**Commands:** admin `pnpm --filter admin test <pat>` / `typecheck` · widget `pnpm --filter widget-src test <pat>` / `typecheck` / `build` · Rust: `cd extensions/shipping-discount-function && cargo build --release --target wasm32-wasip1` (use the target in its `Cargo.toml`/`.cargo/config` if different — check `pnpm --filter shipping-discount-function build` script first).

**Reference (discount-function reads a line's product id like this — mirror it in the shipping fn):**
`let variant = match l.merchandise() { Merchandise::ProductVariant(pv) => pv, _ => continue }; variant.product().id().to_string(); *l.quantity() as u32`.

---

## Task 1: Data model + serializer (`image`, `freeShipping`)

**Files:**
- Modify: `apps/admin/drizzle/schema.ts` (QbTier), `apps/widget-src/src/types.ts` (QbTier), `apps/admin/app/components/QbTierBuilder.tsx` (TierFormValue + DEFAULT_TIER), `apps/admin/app/lib/serialize-qb-tier.ts`
- Test: extend `apps/admin/test/serialize-qb-tier.test.ts`

- [ ] **Step 1: Add fields to both `QbTier` types.** In `apps/admin/drizzle/schema.ts` `QbTier` (after `enabled?`):
```ts
  image?: string;          // tier image URL (display only)
  freeShipping?: boolean;  // grant free shipping when this tier is the active tier
```
In `apps/widget-src/src/types.ts` `QbTier` add the same two lines.

- [ ] **Step 2: Add to the form shape.** In `QbTierBuilder.tsx` `TierFormValue` add `image?: string;` and `freeShipping?: boolean;`. In `DEFAULT_TIER` add `image: undefined,` and `freeShipping: false,`.

- [ ] **Step 3: Write the failing test** — append to `apps/admin/test/serialize-qb-tier.test.ts`:
```ts
it("carries image and freeShipping", () => {
  const out = serializeTierForm({ qty: 3, discountType: "percentage", discountValue: 10, label: "", isMostPopular: false, image: "https://cdn/x.png", freeShipping: true } as never);
  expect(out.image).toBe("https://cdn/x.png");
  expect(out.freeShipping).toBe(true);
});
it("omits image/freeShipping when unset/false", () => {
  const out = serializeTierForm({ qty: 1, discountType: "percentage", discountValue: 0, label: "", isMostPopular: false } as never);
  expect(out.image).toBeUndefined();
  expect(out.freeShipping).toBeUndefined();
});
```

- [ ] **Step 4: Run, verify FAIL.** Run: `pnpm --filter admin test serialize-qb-tier` — Expected: FAIL.

- [ ] **Step 5: Implement in `serialize-qb-tier.ts`.** Add to the returned object:
```ts
    image: t.image || undefined,
    freeShipping: t.freeShipping || undefined,
```

- [ ] **Step 6: Run + typecheck.** Run: `pnpm --filter admin test serialize-qb-tier && pnpm --filter admin typecheck && pnpm --filter widget-src typecheck` — Expected: pass, clean.

- [ ] **Step 7: Commit.**
```bash
git add apps/admin/drizzle/schema.ts apps/widget-src/src/types.ts apps/admin/app/components/QbTierBuilder.tsx apps/admin/app/lib/serialize-qb-tier.ts apps/admin/test/serialize-qb-tier.test.ts
git commit -m "feat(qb): add per-tier image + freeShipping fields + serializer"
```

---

## Task 2: storefront-config carries `image` + `freeShipping` (TDD)

**Files:**
- Modify: `apps/admin/app/lib/storefront-config.ts`
- Test: extend `apps/admin/test/storefront-config.test.ts`

- [ ] **Step 1: Write the failing test.** In `storefront-config.test.ts`, seed a QB whose tier has `image` + `freeShipping: true`, build config, assert `out.quantityBreaks[0].tiers[0].image` and `.freeShipping` are preserved. (Mirror the existing QB tier-enrichment test's seeding.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test storefront-config` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `storefront-config.ts`, in the QB `tiers.map((tr) => ({ ... }))`, add:
```ts
        image: tr.image ?? null,
        freeShipping: tr.freeShipping ?? false,
```

- [ ] **Step 4: Run + typecheck.** Run: `pnpm --filter admin test storefront-config && pnpm --filter admin typecheck` — Expected: pass, clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/app/lib/storefront-config.ts apps/admin/test/storefront-config.test.ts
git commit -m "feat(qb): serialize per-tier image + freeShipping into storefront config"
```

---

## Task 3: metafield-sync includes tier `freeShipping` (not image) (TDD)

**Files:**
- Modify: `apps/admin/app/lib/metafield-sync.ts`
- Test: extend `apps/admin/test/metafield-sync.test.ts`

- [ ] **Step 1: Write the failing test.** In `metafield-sync.test.ts`, build the synced config from a shop whose QB tier has `freeShipping: true` + `image: "x"`; assert the synced `quantityBreaks[0].tiers[0].freeShipping === true` and that `image` is **absent** from the synced tier (functions don't need it). (Mirror the file's existing config-build test.)

- [ ] **Step 2: Run, verify FAIL.** Run: `pnpm --filter admin test metafield-sync` — Expected: FAIL.

- [ ] **Step 3: Implement.** In `metafield-sync.ts`, in the `quantityBreaks[].tiers[]` mapping, add `freeShipping: tr.freeShipping ?? false,` (do NOT add `image`). Also add `freeShipping?: boolean` to the `SyncConfig` QB-tier type if that interface enumerates tier fields explicitly.

- [ ] **Step 4: Run + typecheck.** Run: `pnpm --filter admin test metafield-sync && pnpm --filter admin typecheck` — Expected: pass, clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/admin/app/lib/metafield-sync.ts apps/admin/test/metafield-sync.test.ts
git commit -m "feat(qb): sync per-tier freeShipping into shop metafield config"
```

---

## Task 4: Widget renders tier image + free-ship badge (TDD)

**Files:**
- Modify: `apps/widget-src/src/render-qb.ts`, `apps/widget-src/src/i18n.ts`
- Test: extend `apps/widget-src/src/render-qb.test.ts`

- [ ] **Step 1: Add the i18n key to all 11 locales.** In `apps/widget-src/src/i18n.ts`, add `"qb.freeShipping": "🚚 Free shipping",` to each locale dict (EN value above; translate the others — fr "Livraison gratuite", de "Kostenloser Versand", es "Envío gratis", it "Spedizione gratuita", pt "Frete grátis", nl "Gratis verzending", pl "Darmowa wysyłka", sv "Fri frakt", ja "送料無料", zh "免运费"). Anchor each insert near an existing `qb.*` key in that locale.

- [ ] **Step 2: Write the failing tests.** In `render-qb.test.ts` (mirror the file's render setup):
```ts
it("renders a tier image thumbnail when the tier has an image", () => {
  // render a QB whose tier has image: "https://cdn/x.png"
  expect(mount.querySelector('img[src="https://cdn/x.png"]')).not.toBeNull();
});
it("renders a free-shipping badge when the tier has freeShipping", () => {
  // render a QB whose tier has freeShipping: true
  expect(mount.textContent).toContain("Free shipping");
});
it("renders neither when the tier has no image/freeShipping", () => {
  // a plain tier
  expect(mount.querySelector(".pumper-qb-tier img")).toBeNull();
});
```
(Match the file's actual tier fixture shape; only `image`/`freeShipping` vary.)

- [ ] **Step 3: Run, verify FAIL.** Run: `pnpm --filter widget-src test render-qb` — Expected: FAIL.

- [ ] **Step 4: Implement in `render-qb.ts`.** In the tier-row template (where each tier's title renders), add — guarding on non-empty values:
```ts
${tr.image ? `<img class="pumper-qb-tier-img" src="${escapeAttr(tr.image)}" alt="" loading="lazy" />` : ""}
```
and, in the tier's label/badge area:
```ts
${tr.freeShipping ? `<span class="pumper-qb-freeship">${t("qb.freeShipping")}</span>` : ""}
```
Use the file's existing escape helper for the `src` (e.g. `escapeHtml`/`escapeAttr` — match what's already imported). Add minimal CSS for `.pumper-qb-tier-img` (e.g. `width:40px;height:40px;object-fit:cover;border-radius:6px`) and `.pumper-qb-freeship` in the widget stylesheet (`apps/widget-src/src/widget.css` or wherever QB styles live). Reserve the image box size to keep CLS = 0.

- [ ] **Step 5: Run + typecheck + build.** Run: `pnpm --filter widget-src test render-qb && pnpm --filter widget-src typecheck && pnpm --filter widget-src build` — Expected: pass, clean, build success.

- [ ] **Step 6: Commit.**
```bash
git add apps/widget-src/src/render-qb.ts apps/widget-src/src/render-qb.test.ts apps/widget-src/src/i18n.ts apps/widget-src/src/widget.css extensions/theme-app-extension/assets apps/admin/public
git commit -m "feat(widget): render per-tier image + free-shipping badge"
```

---

## Task 5: Add-Ons chips in `QbTierBuilder`

**Files:**
- Modify: `apps/admin/app/components/QbTierBuilder.tsx`

- [ ] **Step 1: Read how `ShopifyImageField` is used.** Open `apps/admin/app/components/ShopifyImageField.tsx` and an existing consumer to learn its props (likely `value`/`onChange` returning a URL). Use the real API.

- [ ] **Step 2: Add an Add-Ons chip row in the expanded tier body.** A row of three toggle `Button`s — **+ Free Gift**, **+ Image**, **+ Free Ship** — each `pressed` when its data is active (`!!tier.freeGiftVariant`, `!!tier.image`, `tier.freeShipping === true`). Clicking toggles open state for free-gift/image (and clears the data when toggled off), and directly toggles `freeShipping`. Keep local open-state per chip (e.g. `const [openAddon, setOpenAddon] = useState<Record<number, {gift?:boolean;image?:boolean}>>({})`), or derive "open" from data-present. Beneath the chips, conditionally render:
  - **Free Gift block** (when on): the EXISTING per-tier free-gift `VariantPicker` — RELOCATE it here from the current "Advanced" section; bind to `tier.freeGiftVariant` via `updateTier(i, { freeGiftVariant })`. Toggling the chip off → `updateTier(i, { freeGiftVariant: null })`.
  - **Image block** (when on): `<ShopifyImageField value={tier.image ?? ""} onChange={(url) => updateTier(i, { image: url || undefined })} />` (match the real prop names). Toggling off → `updateTier(i, { image: undefined })`.
  - **Free Ship**: no block — the chip toggles `updateTier(i, { freeShipping: !tier.freeShipping })`.
  Match the file's Polaris idioms (`ButtonGroup`/`Button`/`InlineStack`). If the free-gift `VariantPicker` currently lives in `AdvancedSection`, move only the free-gift part; leave other advanced UI (extra products) where it is.

- [ ] **Step 3: Typecheck + tests.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, green.

- [ ] **Step 4: Commit.**
```bash
git add apps/admin/app/components/QbTierBuilder.tsx
git commit -m "feat(qb): per-tier Add-Ons chips (free gift / image / free ship)"
```

---

## Task 6: Rust shipping function grants free shipping for active QB tier

**Files:**
- Modify: `extensions/shipping-discount-function/src/run.graphql`, `extensions/shipping-discount-function/src/run.rs`

- [ ] **Step 1: Extend the input query.** In `run.graphql`, add cart lines (mirror the discount-function):
```graphql
query Input {
  cart {
    cost { subtotalAmount { amount } }
    lines {
      quantity
      merchandise {
        __typename
        ... on ProductVariant { product { id } }
      }
    }
    deliveryGroups { deliveryOptions { handle } }
  }
  shop { metafield(namespace: "pumper", key: "config") { value } }
}
```

- [ ] **Step 2: Build once to regenerate the schema types.** Run the crate's build (check `extensions/shipping-discount-function/package.json` for the build script; likely `cargo build --release --target wasm32-wasip1`). This regenerates `super::schema` with `cart().lines()` + the `Merchandise` enum. Note the exact generated `Merchandise` path/import the discount-function uses and mirror it.

- [ ] **Step 3: Add QB structs + matching logic to `run.rs`.** Extend `ShopConfig`:
```rust
#[derive(Deserialize, Debug, Default)]
struct ShopConfig {
    #[serde(rename = "progressiveGifts", default)]
    progressive_gifts: Vec<ProgressiveGift>,
    #[serde(rename = "quantityBreaks", default)]
    quantity_breaks: Vec<QuantityBreak>,
}

#[derive(Deserialize, Debug)]
struct QuantityBreak {
    status: String,
    #[serde(rename = "productId")]
    product_id: String,
    #[serde(default)]
    tiers: Vec<QbTier>,
}

#[derive(Deserialize, Debug)]
struct QbTier {
    qty: u32,
    #[serde(rename = "freeShipping", default)]
    free_shipping: bool,
}
```
After computing the PG `lowest`/`threshold_cents` result, compute a **QB free-ship** flag: for each active QB, for each cart line whose product id == `qb.product_id`, find the active tier = the `tiers` entry with the **max `qty` such that `qty <= line.quantity`**; if that tier's `free_shipping` is true, set `qb_free_ship = true`. Then **grant free shipping if `(subtotal >= threshold)` OR `qb_free_ship`** (union). Refactor the existing early-returns so the "build delivery targets + return 100% off" block runs when EITHER condition holds (today it returns `no_discount` if there's no PG threshold — change that so a QB free-ship still applies even with zero PG thresholds). Extract a helper `fn qb_free_ship(cart, config) -> bool` for testability. Mirror the discount-function's line access: `match l.merchandise() { schema::Merchandise::ProductVariant(pv) => pv.product().id().to_string(), _ => continue }` and `*l.quantity() as u32`.

- [ ] **Step 4: Add a Rust unit test.** Add `#[cfg(test)] mod tests` in `run.rs` testing the pure tier-match helper on plain data (a `QuantityBreak` with tiers `[{qty:2,free_shipping:false},{qty:5,free_shipping:true}]` + a cart line qty 5 → true; qty 4 → false (active tier is qty:2, no free ship); qty 1 → false). If the helper must take the generated cart type (hard to construct in tests), instead extract the tier-matching into a pure function `active_tier_free_ship(tiers: &[QbTier], line_qty: u32) -> bool` and unit-test THAT (qty 5 → true, qty 4 → false, qty 1 → false), and call it from the cart loop.

- [ ] **Step 5: Build + test.** Run the crate build (Step 2 command) — Expected: compiles to wasm, no errors. Run `cd extensions/shipping-discount-function && cargo test` — Expected: the new unit test passes.

- [ ] **Step 6: Commit.**
```bash
git add extensions/shipping-discount-function/src/run.graphql extensions/shipping-discount-function/src/run.rs
git commit -m "feat(shipping-fn): grant free shipping for active QB tier with freeShipping"
```

---

## Task 7: Full verification + deploy

- [ ] **Step 1: Admin.** Run: `pnpm --filter admin typecheck && pnpm --filter admin test` — Expected: clean, all green.
- [ ] **Step 2: Widget.** Run: `pnpm --filter widget-src typecheck && pnpm --filter widget-src test && pnpm --filter widget-src build` — Expected: clean, green, build success.
- [ ] **Step 3: Rust.** Run the shipping-function build + `cargo test` — Expected: wasm builds, unit test green.
- [ ] **Step 4: Manual (dev store).** Set a tier image + free-ship; save; storefront PDP shows the thumbnail + "Free shipping" badge on that tier; add the tier's quantity to cart and confirm free shipping at checkout; confirm a non-free-ship tier does not grant it; confirm progressive-gift free shipping still works.
- [ ] **Step 5: Deploy (when approved).**
  - Admin: `pnpm --filter admin build && cd apps/admin && pnpm run deploy`
  - Widget + Rust shipping function: `pnpm shopify app deploy --force` (from repo root — ships the rebuilt widget AND the shipping function).

---

## Self-review notes
- **Spec coverage:** fields + serializer (T1), storefront-config display (T2), metafield freeShipping-only (T3), widget image+badge+i18n (T4), Add-Ons chips incl. relocating free gift (T5), Rust shipping union logic + test (T6), verify+deploy (T7). All spec sections covered.
- **Image not synced to metafield** — honored in T3 (assert image absent).
- **Active-tier rule** — T6 matches the discount-function's max-qty-≤-line-qty rule; unit-tested via `active_tier_free_ship`.
- **Type consistency:** `image?: string` / `freeShipping?: boolean` identical across schema QbTier, widget QbTier, TierFormValue; `serializeTierForm` carries both; Rust `free_shipping` (serde rename `freeShipping`) matches the synced JSON key.
- **Ships the function:** T7 step 5 runs `shopify app deploy` (the only way the Rust change reaches checkout).
