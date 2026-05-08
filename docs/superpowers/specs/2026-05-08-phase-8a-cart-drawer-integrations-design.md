# Phase 8.A: Cart Drawer Integrations — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review
**Parent phase:** Phase 8 — Polish for BFS (decomposed into 6 independent sub-projects; this is sub-project A)

---

## 1. Goal

Match Pumper's claim of supporting 8 named cart drawer apps so that, after a customer adds a bundle/QB to cart from our widget, the merchant's chosen drawer (Upcart, Slide Cart, etc.) actually refreshes and opens — without forcing a `/cart` page redirect.

## 2. Drawers in scope

| # | App | Refresh trigger | "Opened" event |
|---|---|---|---|
| 1 | Slide Cart Drawer (Aurora Native) | `cart:refresh` event (already dispatched generically) + `window.SlideCart?.fetchCart?.()` | `slidecart:open` |
| 2 | Upcart (CartKit) | `dispatchEvent("upcart:refresh")` + `window.UpCart?.refresh?.()` | `upcart:opened` |
| 3 | qikify Slide Cart | `cart:refresh` event + `window.QikifySlideCart?.refresh?.()` | `qikify:cart:opened` |
| 4 | Monster Cart (Webrex) | `dispatchEvent("monster-cart:refresh")` + `window.WebrexMonsterCart?.refresh?.()` | `monster-cart:opened` |
| 5 | AMP Slider Cart (Hulk) | `dispatchEvent("amp-slider-cart:refresh")` + `window.AmpSliderCart?.refresh?.()` | `amp-slider-cart:opened` |
| 6 | Opus Cart | `dispatchEvent("OpusCart:refresh")` + `window.OpusCart?.refresh?.()` | `OpusCart:open` |
| 7 | Releasit COD | `cart:refresh` event (already dispatched generically) | n/a — injects upsell form, doesn't open a drawer |
| 8 | EasyCOD | `cart:refresh` event + `dispatchEvent("easycod:refresh")` | n/a — same |

Confidence: high for Upcart / Slide Cart / Releasit; medium for qikify / Opus / EasyCOD; low for Monster / AMP Slider (inferred from public theme dev forum threads, not first-hand testing). If any adapter is wrong, the `/cart` redirect fallback covers the failure case — same UX as today.

## 3. Architecture

**Approach:** dispatch-all + safe-imperative. No drawer detection logic.

After a successful `/cart/add.js` POST, the widget calls `notifyCartDrawer()`. That function unconditionally fires every drawer's refresh trigger:
- For event-based drawers: `document.dispatchEvent(new CustomEvent("upcart:refresh"))` etc. — no-op if no listener registered.
- For drawers with imperative APIs: `window.UpCart?.refresh?.()` — optional chain returns undefined if global isn't installed.

Total cost: ~6 event dispatches + ~6 optional-chain checks. Sub-millisecond. No tree-shake or bundle-size concern.

**Why no detection?** Detection adds ~100 LOC of fragile DOM/window sniffing that gets out of sync as drawer apps update their internals. Dispatching to a listener that doesn't exist is harmless. Calling an optional method via `?.` that doesn't exist is harmless. Saves complexity; eliminates a class of false-negative bugs.

## 4. File manifest

**Created:**
- `apps/widget-src/src/cart-drawer-bridge.ts` (~80 LOC)
- `apps/widget-src/src/cart-drawer-bridge.test.ts` (~120 LOC, 9 tests)

**Modified:**
- `apps/widget-src/src/add-to-cart.ts` (~10 LOC added)
- `apps/widget-src/src/add-to-cart.test.ts` (~30 LOC added, 1 new test)

The build (`pnpm --filter widget-src build`) picks up the new module automatically via tsup; the existing pipeline that ships `extensions/theme-app-extension/assets/widget.js` requires no config change.

## 5. Module API

`apps/widget-src/src/cart-drawer-bridge.ts`:

```ts
type DrawerAdapter = {
  name: string;
  refresh: () => void;
};

const ADAPTERS: DrawerAdapter[] = [
  // 8 entries — see Section 2 table for the body of each refresh()
];

export function notifyCartDrawer(): void {
  // Deliberately does NOT dispatch cart:refresh / cart:update — those are
  // dispatched by add-to-cart.ts AFTER awaiting drawerWillOpen, which itself
  // listens for cart:refresh. Dispatching here would resolve the promise
  // immediately and break the /cart fallback for stock themes.
  for (const a of ADAPTERS) {
    try { a.refresh(); } catch { /* no adapter should ever throw; swallow if it does */ }
  }
}

// For tests
export const _adaptersForTest = ADAPTERS;

export const DRAWER_OPEN_EVENTS: readonly string[] = [
  "slidecart:open",
  "upcart:opened",
  "qikify:cart:opened",
  "monster-cart:opened",
  "amp-slider-cart:opened",
  "OpusCart:open",
];
```

## 6. Integration points

`apps/widget-src/src/add-to-cart.ts` — extend the existing `drawerWillOpen` promise (currently lines 23-29) to also listen for each event in `DRAWER_OPEN_EVENTS`, and call `notifyCartDrawer()` after the existing generic dispatches:

```ts
import { notifyCartDrawer, DRAWER_OPEN_EVENTS } from "./cart-drawer-bridge";

// Inside addToCart(), after fetch succeeds:
const drawerWillOpen = new Promise<boolean>((resolve) => {
  let done = false;
  const onChange = () => { if (!done) { done = true; resolve(true); } };
  document.addEventListener("cart:refresh", onChange, { once: true });
  document.addEventListener("cart:update", onChange, { once: true });
  for (const ev of DRAWER_OPEN_EVENTS) {
    document.addEventListener(ev, onChange, { once: true });
  }
  setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs);
});

// Pre-await: drawer-specific events / imperative APIs.
notifyCartDrawer();

const drawerOpened = await drawerWillOpen;

// Post-await: generic cart events for cart-counter widgets and drawers
// that listen here. Order preserves the original behavior so the existing
// /cart redirect fallback for stock themes still works.
document.dispatchEvent(new CustomEvent("cart:refresh"));
document.dispatchEvent(new CustomEvent("cart:update"));

if (!drawerOpened) {
  window.location.href = "/cart";
}
```

The 800ms timeout + `/cart` redirect fallback stays untouched.

## 7. Testing

**`cart-drawer-bridge.test.ts`** — 9 vitest cases (vitest already configured for jsdom in this workspace):

For each of the 8 drawers, one test that:
1. Resets `document` listeners and `window` globals (`beforeEach` cleanup)
2. Sets up the drawer's mock — either `window.UpCart = { refresh: vi.fn() }` (imperative) or `document.addEventListener("upcart:refresh", spy)` (event)
3. Calls `notifyCartDrawer()`
4. Asserts the spy was called

For drawers with both APIs (Upcart, Monster, AMP, Opus, qikify), assert *both*: the imperative method invocation AND the event dispatch.

**Test 9 (negative):** with NO mock set up, `notifyCartDrawer()` runs without throwing. Catches missing optional chains.

**`add-to-cart.test.ts`** — append one new test:

> When `upcart:opened` event fires within 800ms after `addToCart` resolves, `window.location.href` is NOT set to `/cart`.

Verifies `DRAWER_OPEN_EVENTS` is wired into `drawerWillOpen`.

## 8. Out of scope (deferred)

- Real-store QA on each drawer — deferred to a manual gate (Phase 8.A.QA, separate task). The unit tests assert *we* call the documented API correctly; whether the documented API still works against the live drawer's current version is a manual check.
- (No latent fallback bug. Earlier draft of this spec claimed there was one — re-reading the original add-to-cart.ts confirms generic `cart:refresh` is dispatched AFTER awaiting `drawerWillOpen`, so our own dispatch can't race with the listener. We preserve that ordering.)
- i18n inside cart drawer integrations — drawers render their own UI, not ours; nothing to translate.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Drawer's documented event name changes | Adapter is a one-line fix; ship updated patch when reported |
| Adapter throws (e.g. drawer's imperative API throws unexpectedly) | `try/catch` around each `refresh()` call in the loop swallows it; other adapters still fire |
| Customer has 2+ drawers installed (rare) | All adapters fire; whichever drawer opens first resolves `drawerWillOpen`. No conflict. |
| `DRAWER_OPEN_EVENTS` listeners cause memory leak if user navigates before they fire | Each is `{ once: true }`; removed on first fire OR garbage-collected with the page navigation |

---

## 10. Manual QA checklist (Phase 8.A.QA — separate task)

For each drawer below, real-store verification requires installing the drawer on `deepseatools.myshopify.com`, creating a bundle/QB on a test product, then clicking add-to-cart. Pass criterion: drawer opens and shows the new line item without redirecting to `/cart`.

- [ ] Slide Cart Drawer (Aurora Native)
- [ ] Upcart (CartKit)
- [ ] qikify Slide Cart
- [ ] Monster Cart (Webrex)
- [ ] AMP Slider Cart (Hulk)
- [ ] Opus Cart
- [ ] Releasit COD (verify upsell form refreshes after add; no drawer to "open")
- [ ] EasyCOD (same — verify form refreshes)

If any drawer fails: open its app's developer docs, find the actual current refresh-event name or imperative API, update the corresponding entry in `apps/widget-src/src/cart-drawer-bridge.ts`, rebuild widget. One-line fix per drawer.
