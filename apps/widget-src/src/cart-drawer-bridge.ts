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
