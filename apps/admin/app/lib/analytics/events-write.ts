import { schema } from "~/db.server";

type EventInput = {
  type: "widget_impression" | "widget_click" | "add_to_cart";
  widgetType: "bundle" | "qb" | "mix_match";
  widgetId: string;
  productId?: string;
  tierQty?: number;
  valueCents?: number;
  ts: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeStorefrontEvent(db: any, shopId: string, event: EventInput): Promise<void> {
  await db.insert(schema.events).values({
    id: crypto.randomUUID(),
    shopId,
    type: event.type,
    widgetType: event.widgetType,
    widgetId: event.widgetId,
    productId: event.productId ?? null,
    tierQty: event.tierQty ?? null,
    valueCents: event.valueCents ?? 0,
    ts: event.ts,
  });
}
