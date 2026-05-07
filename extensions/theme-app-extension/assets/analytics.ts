type EventType = "widget_impression" | "widget_click" | "add_to_cart";

type EventPayload = {
  widgetType: "bundle" | "qb" | "mix_match";
  widgetId: string;
  productId?: string;
  tierQty?: number;
  valueCents?: number;
};

let apiBase = "";
let shop = "";

export function configureAnalytics(opts: { apiBase: string; shop: string }): void {
  apiBase = opts.apiBase;
  shop = opts.shop;
}

export function emit(type: EventType, data: EventPayload): void {
  if (typeof window !== "undefined" && window._pumperPreview) return;
  if (!apiBase || !shop) return;
  const body = JSON.stringify({ type, shop, ts: Date.now(), ...data });
  const url = `${apiBase}/event`;
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      navigator.sendBeacon(url, body);
      return;
    } catch {
      // fall through to fetch
    }
  }
  try {
    fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // swallow
  }
}
