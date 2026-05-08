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
