# Phase 8.A: Cart Drawer Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship adapter logic for 8 named cart drawer apps (Slide Cart, Upcart, qikify, Monster, AMP, Opus, Releasit COD, EasyCOD) so a successful bundle/QB add-to-cart triggers each drawer's refresh+open without forcing a `/cart` redirect.

**Architecture:** A single `cart-drawer-bridge.ts` module exports `notifyCartDrawer()` (called after `/cart/add.js` succeeds) and `DRAWER_OPEN_EVENTS` (a list of drawer-specific "opened" event names that the existing `drawerWillOpen` race extends to listen for). Dispatch-all + safe-imperative pattern: every adapter unconditionally fires its event/method; optional chaining handles absent globals. No drawer detection.

**Tech Stack:** TypeScript, vitest with jsdom, tsup build that copies `widget.js` into `extensions/theme-app-extension/assets/`.

**Reference docs:**
- Spec: [docs/superpowers/specs/2026-05-08-phase-8a-cart-drawer-integrations-design.md](../specs/2026-05-08-phase-8a-cart-drawer-integrations-design.md)
- Existing add-to-cart logic: [apps/widget-src/src/add-to-cart.ts](../../../apps/widget-src/src/add-to-cart.ts)
- Existing test patterns: [apps/widget-src/src/add-to-cart.test.ts](../../../apps/widget-src/src/add-to-cart.test.ts)

**Codebase conventions:**
- Tests use vitest + jsdom; `vi.restoreAllMocks()` and `vi.unstubAllGlobals()` in `beforeEach`
- Path: `apps/widget-src/src/<file>.ts` and adjacent `<file>.test.ts`
- Run from `apps/widget-src/`: `pnpm test` (vitest run), `pnpm build` (tsup → copy to admin extension)
- The build's `copy:to-admin` step writes `extensions/theme-app-extension/assets/widget.js` automatically — no separate step needed
- Commit straight to `main` (team workflow for this repo — see prior phase commits)

---

## File Structure

**Created:**
| Path | Responsibility |
|---|---|
| `apps/widget-src/src/cart-drawer-bridge.ts` | 8 adapter declarations + `notifyCartDrawer()` + `DRAWER_OPEN_EVENTS` |
| `apps/widget-src/src/cart-drawer-bridge.test.ts` | 9 unit tests (8 drawers + 1 negative no-throw) |

**Modified:**
| Path | Change |
|---|---|
| `apps/widget-src/src/add-to-cart.ts` | Import `notifyCartDrawer`, `DRAWER_OPEN_EVENTS`; extend `drawerWillOpen` race; call `notifyCartDrawer()` |
| `apps/widget-src/src/add-to-cart.test.ts` | One new test: drawer-specific opened event cancels `/cart` redirect |

---

## Task 1: cart-drawer-bridge module

**Files:**
- Create: `apps/widget-src/src/cart-drawer-bridge.ts`
- Test: `apps/widget-src/src/cart-drawer-bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/widget-src/src/cart-drawer-bridge.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { notifyCartDrawer, DRAWER_OPEN_EVENTS } from "./cart-drawer-bridge";

describe("notifyCartDrawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    // Clean up any window globals adapters may have read
    delete (window as unknown as Record<string, unknown>).SlideCart;
    delete (window as unknown as Record<string, unknown>).UpCart;
    delete (window as unknown as Record<string, unknown>).QikifySlideCart;
    delete (window as unknown as Record<string, unknown>).WebrexMonsterCart;
    delete (window as unknown as Record<string, unknown>).AmpSliderCart;
    delete (window as unknown as Record<string, unknown>).OpusCart;
  });

  it("does NOT dispatch cart:refresh (caller is responsible — see add-to-cart.ts)", () => {
    // notifyCartDrawer is called BEFORE awaiting drawerWillOpen, which itself listens
    // for cart:refresh. If we dispatched cart:refresh here, the listener would fire
    // and the /cart redirect fallback would never trigger for stock themes.
    const spy = vi.fn();
    document.addEventListener("cart:refresh", spy, { once: true });
    notifyCartDrawer();
    expect(spy).not.toHaveBeenCalled();
  });

  it("Slide Cart: calls window.SlideCart.fetchCart() if present", () => {
    const fetchCart = vi.fn();
    (window as unknown as Record<string, unknown>).SlideCart = { fetchCart };
    notifyCartDrawer();
    expect(fetchCart).toHaveBeenCalledOnce();
  });

  it("Upcart: dispatches upcart:refresh AND calls window.UpCart.refresh()", () => {
    const evSpy = vi.fn();
    const apiSpy = vi.fn();
    document.addEventListener("upcart:refresh", evSpy, { once: true });
    (window as unknown as Record<string, unknown>).UpCart = { refresh: apiSpy };
    notifyCartDrawer();
    expect(evSpy).toHaveBeenCalledOnce();
    expect(apiSpy).toHaveBeenCalledOnce();
  });

  it("qikify: calls window.QikifySlideCart.refresh() if present", () => {
    const refresh = vi.fn();
    (window as unknown as Record<string, unknown>).QikifySlideCart = { refresh };
    notifyCartDrawer();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("Monster Cart: dispatches monster-cart:refresh AND calls window.WebrexMonsterCart.refresh()", () => {
    const evSpy = vi.fn();
    const apiSpy = vi.fn();
    document.addEventListener("monster-cart:refresh", evSpy, { once: true });
    (window as unknown as Record<string, unknown>).WebrexMonsterCart = { refresh: apiSpy };
    notifyCartDrawer();
    expect(evSpy).toHaveBeenCalledOnce();
    expect(apiSpy).toHaveBeenCalledOnce();
  });

  it("AMP Slider Cart: dispatches amp-slider-cart:refresh AND calls window.AmpSliderCart.refresh()", () => {
    const evSpy = vi.fn();
    const apiSpy = vi.fn();
    document.addEventListener("amp-slider-cart:refresh", evSpy, { once: true });
    (window as unknown as Record<string, unknown>).AmpSliderCart = { refresh: apiSpy };
    notifyCartDrawer();
    expect(evSpy).toHaveBeenCalledOnce();
    expect(apiSpy).toHaveBeenCalledOnce();
  });

  it("Opus Cart: dispatches OpusCart:refresh AND calls window.OpusCart.refresh()", () => {
    const evSpy = vi.fn();
    const apiSpy = vi.fn();
    document.addEventListener("OpusCart:refresh", evSpy, { once: true });
    (window as unknown as Record<string, unknown>).OpusCart = { refresh: apiSpy };
    notifyCartDrawer();
    expect(evSpy).toHaveBeenCalledOnce();
    expect(apiSpy).toHaveBeenCalledOnce();
  });

  it("EasyCOD: dispatches easycod:refresh", () => {
    const spy = vi.fn();
    document.addEventListener("easycod:refresh", spy, { once: true });
    notifyCartDrawer();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("does not throw when no drawers are installed (all globals absent)", () => {
    expect(() => notifyCartDrawer()).not.toThrow();
  });
});

describe("DRAWER_OPEN_EVENTS", () => {
  it("lists exactly the 6 drawer-specific opened events", () => {
    expect(DRAWER_OPEN_EVENTS).toEqual([
      "slidecart:open",
      "upcart:opened",
      "qikify:cart:opened",
      "monster-cart:opened",
      "amp-slider-cart:opened",
      "OpusCart:open",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/widget-src && pnpm test src/cart-drawer-bridge.test.ts`
Expected: FAIL with `Failed to resolve import "./cart-drawer-bridge"` or similar (module does not exist).

- [ ] **Step 3: Implement cart-drawer-bridge.ts**

Create `apps/widget-src/src/cart-drawer-bridge.ts`:
```ts
// Cart drawer bridge.
//
// We support 8 named cart-drawer apps. Strategy is dispatch-all + safe-imperative:
// every adapter unconditionally fires its event/method. Listeners that don't exist
// are harmless; optional chaining covers absent window globals. No drawer detection.
//
// If a drawer's API has changed, our refresh call no-ops and the existing
// `/cart` redirect fallback in add-to-cart.ts kicks in (same UX as today).

type DrawerAdapter = {
  name: string;
  refresh: () => void;
};

// Loose typings for window globals each drawer may attach
type WinUnknown = Record<string, unknown>;
function getWin(): WinUnknown {
  return window as unknown as WinUnknown;
}

function safeCall(obj: unknown, method: string): void {
  if (obj && typeof obj === "object") {
    const fn = (obj as Record<string, unknown>)[method];
    if (typeof fn === "function") {
      try { (fn as () => void).call(obj); } catch { /* swallow */ }
    }
  }
}

const ADAPTERS: DrawerAdapter[] = [
  {
    name: "Slide Cart Drawer (Aurora Native)",
    refresh: () => {
      // Slide Cart auto-listens to cart:refresh — covered by the generic dispatch in add-to-cart.ts
      // Also call its imperative API if exposed.
      safeCall(getWin().SlideCart, "fetchCart");
    },
  },
  {
    name: "Upcart (CartKit)",
    refresh: () => {
      document.dispatchEvent(new CustomEvent("upcart:refresh"));
      safeCall(getWin().UpCart, "refresh");
    },
  },
  {
    name: "qikify Slide Cart",
    refresh: () => {
      // qikify auto-listens to cart:refresh (covered by generic dispatch); also try imperative.
      safeCall(getWin().QikifySlideCart, "refresh");
    },
  },
  {
    name: "Monster Cart (Webrex)",
    refresh: () => {
      document.dispatchEvent(new CustomEvent("monster-cart:refresh"));
      safeCall(getWin().WebrexMonsterCart, "refresh");
    },
  },
  {
    name: "AMP Slider Cart (Hulk)",
    refresh: () => {
      document.dispatchEvent(new CustomEvent("amp-slider-cart:refresh"));
      safeCall(getWin().AmpSliderCart, "refresh");
    },
  },
  {
    name: "Opus Cart",
    refresh: () => {
      document.dispatchEvent(new CustomEvent("OpusCart:refresh"));
      safeCall(getWin().OpusCart, "refresh");
    },
  },
  {
    name: "Releasit COD",
    refresh: () => {
      // Releasit polls cart on cart:refresh (covered by generic dispatch). No imperative API.
      // No-op here; left as a named adapter for completeness.
    },
  },
  {
    name: "EasyCOD",
    refresh: () => {
      document.dispatchEvent(new CustomEvent("easycod:refresh"));
    },
  },
];

export function notifyCartDrawer(): void {
  // We deliberately do NOT dispatch cart:refresh / cart:update here.
  // Those are dispatched by add-to-cart.ts AFTER awaiting drawerWillOpen,
  // because drawerWillOpen itself listens for cart:refresh — dispatching it
  // here would resolve the promise immediately and break the /cart fallback
  // for stock themes (no drawer installed).
  for (const a of ADAPTERS) {
    try { a.refresh(); } catch { /* swallow */ }
  }
}

export const DRAWER_OPEN_EVENTS: readonly string[] = [
  "slidecart:open",
  "upcart:opened",
  "qikify:cart:opened",
  "monster-cart:opened",
  "amp-slider-cart:opened",
  "OpusCart:open",
];

// Test-only export to allow assertions on the adapter list shape.
export const _adaptersForTest = ADAPTERS;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/widget-src && pnpm test src/cart-drawer-bridge.test.ts`
Expected: PASS — 10 tests green (9 in `notifyCartDrawer` describe including the negative cart:refresh assertion + 1 in `DRAWER_OPEN_EVENTS` describe).

- [ ] **Step 5: Commit**

```bash
git add apps/widget-src/src/cart-drawer-bridge.ts apps/widget-src/src/cart-drawer-bridge.test.ts
git commit -m "feat(widget): add cart-drawer-bridge with 8 adapters"
```

---

## Task 2: Wire bridge into add-to-cart

**Files:**
- Modify: `apps/widget-src/src/add-to-cart.ts`
- Modify: `apps/widget-src/src/add-to-cart.test.ts`

- [ ] **Step 1: Append failing test for drawer-specific opened event**

Append to `apps/widget-src/src/add-to-cart.test.ts` (inside the existing `describe("addToCart", ...)` block, before the closing `});`):
```ts
  it("does not redirect when upcart:opened event fires (drawer-specific)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    const promise = addToCart("b1", [{ variantId: "v1", qty: 1, bundleId: "b1" }], { timeoutMs: 50 });
    document.dispatchEvent(new CustomEvent("upcart:opened"));
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(window.location.href).toBe("");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/widget-src && pnpm test src/add-to-cart.test.ts`
Expected: The new test FAILS — `window.location.href` becomes `/cart` because `add-to-cart.ts` doesn't yet listen for `upcart:opened`. (The other 6 existing tests still pass.)

- [ ] **Step 3: Update add-to-cart.ts to wire in the bridge**

Replace the contents of `apps/widget-src/src/add-to-cart.ts` with:
```ts
import { notifyCartDrawer, DRAWER_OPEN_EVENTS } from "./cart-drawer-bridge";

export type CartLineInput = {
  variantId: string;
  qty: number;
  bundleId?: string;
  giftBundleId?: string;
};

export type AddResult = { ok: true } | { ok: false; error: string };

export async function addToCart(
  bundleId: string,
  lines: CartLineInput[],
  opts: { timeoutMs?: number } = {},
): Promise<AddResult> {
  // No-op in admin preview iframe: there is no real cart on this origin and
  // calling /cart/add.js would 404 then surface as "Couldn't add to cart".
  if (typeof window !== "undefined" && window._pumperPreview) {
    return { ok: true };
  }

  const timeoutMs = opts.timeoutMs ?? 800;

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

  let res: Response;
  try {
    res = await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        items: lines.map((l) => {
          const properties: Record<string, string> = {};
          if (l.bundleId) properties._pumper_bundle_id = l.bundleId;
          if (l.giftBundleId) properties._pumper_gift_id = l.giftBundleId;
          return {
            id: l.variantId,
            quantity: l.qty,
            properties,
          };
        }),
      }),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? "Network error" };
  }

  if (!res.ok) {
    let errMsg = "Could not add to cart";
    try {
      const j = (await res.json()) as { description?: string };
      if (j.description) errMsg = j.description;
    } catch {
      // ignore
    }
    return { ok: false, error: errMsg };
  }

  // Drawer-specific events / imperative API calls fire BEFORE we await drawerWillOpen.
  // notifyCartDrawer deliberately does NOT dispatch cart:refresh — that's dispatched
  // post-await for cart-counter widgets and as a fallthrough for drawers that listen
  // to it but missed our drawer-specific signals.
  notifyCartDrawer();

  const drawerOpened = await drawerWillOpen;

  // Generic cart events for cart-counter widgets and drawers that only listen here.
  document.dispatchEvent(new CustomEvent("cart:refresh"));
  document.dispatchEvent(new CustomEvent("cart:update"));

  if (!drawerOpened) {
    window.location.href = "/cart";
  }

  return { ok: true };
}
```

Order rationale:
1. **Pre-await:** `notifyCartDrawer()` fires drawer-specific events + imperative API calls. Drawers that have their own opened event (`upcart:opened`, etc.) emit it during this window → `drawerWillOpen` resolves true.
2. **Post-await:** generic `cart:refresh` / `cart:update` dispatch for cart-counter widgets and drawers that intercept these events. Order matches the pre-existing behavior so the `/cart` redirect still fires for stock themes (the existing test `redirects to /cart when no theme drawer event fires within timeout` continues to pass).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/widget-src && pnpm test src/add-to-cart.test.ts`
Expected: PASS — all 7 tests green (6 original + 1 new `upcart:opened` test).

- [ ] **Step 5: Commit**

```bash
git add apps/widget-src/src/add-to-cart.ts apps/widget-src/src/add-to-cart.test.ts
git commit -m "feat(widget): wire cart-drawer-bridge into add-to-cart"
```

---

## Task 3: Full sweep + widget rebuild

**Files:** None directly (verification + build artifact)

- [ ] **Step 1: Run the full widget-src test suite**

Run: `cd apps/widget-src && pnpm test`
Expected: ALL pass — 0 regressions in any existing test (match.test, render-bundle.test, render-qb.test, render-mix-match.test, format.test, i18n.test, analytics.test, widget.test, add-to-cart.test, plus the new cart-drawer-bridge.test).

- [ ] **Step 2: Rebuild the widget bundle**

Run: `cd apps/widget-src && pnpm build`
Expected: SUCCESS — `tsup` compiles to IIFE; the script's `copy:to-admin` step then writes the new `extensions/theme-app-extension/assets/widget.js` (and `.css`).

- [ ] **Step 3: Sanity-check the rebuilt widget.js contains the new bridge**

Run: `grep -c "upcart:refresh\|monster-cart:refresh\|OpusCart:refresh" extensions/theme-app-extension/assets/widget.js`
Expected: `3` (or higher — confirms the new event names made it into the IIFE bundle).

- [ ] **Step 4: Verify bundle size hasn't regressed past spec budget (<30KB gzipped)**

Run: `gzip -c extensions/theme-app-extension/assets/widget.js | wc -c`
Expected: well under 30720 bytes (30KB). The bridge adds ~2KB raw / ~600B gzipped — bundle was ~16KB raw before, well within budget.

- [ ] **Step 5: Commit the rebuilt widget**

```bash
git add extensions/theme-app-extension/assets/widget.js extensions/theme-app-extension/assets/widget.css
git commit -m "chore(widget): rebuild with cart-drawer-bridge"
```

(Only `.css` if the build output changed — it likely didn't; if `git status` shows only `widget.js` is modified, just commit that.)

---

## Task 4: Manual gate (cannot be automated)

This is documentation-only — the actual QA happens later when a merchant has each drawer installed on a real store. Add to the project's docs so future-you remembers what to test.

**Files:**
- Append to: `docs/superpowers/specs/2026-05-08-phase-8a-cart-drawer-integrations-design.md` (under section 8, "Out of scope")

- [ ] **Step 1: Add the manual QA checklist**

Append to `docs/superpowers/specs/2026-05-08-phase-8a-cart-drawer-integrations-design.md` after the existing content:
```markdown

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
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-08-phase-8a-cart-drawer-integrations-design.md
git commit -m "docs(phase-8a): document per-drawer manual QA checklist"
```

---

## Phase 8.A Done When

- All 4 tasks above checked off
- `cd apps/widget-src && pnpm test` green
- `cd apps/widget-src && pnpm build` green
- New `widget.js` committed; bundle size verified under 30KB gzipped
- Manual QA checklist appended to spec for future verification

Phase 8.A.QA (real-store verification of each drawer) is a separate follow-up task and not blocking this phase's completion.
