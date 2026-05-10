import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import type { StickyAtcSettings } from "../../../drizzle/schema";

const DEFAULTS = {
  enabled: false,
  showImage: true,
  showQty: true,
  showPrice: true,
  ctaLabel: "Add to cart",
  backgroundColor: "#FFFFFF",
  textColor: "#1A1A1A",
  buttonBg: "#1A1A1A",
  buttonText: "#FFFFFF",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrDefault(db: any, shopId: string): Promise<StickyAtcSettings> {
  const rows = await db
    .select()
    .from(schema.stickyAtcSettings)
    .where(eq(schema.stickyAtcSettings.shopId, shopId))
    .limit(1);
  if (rows[0]) return rows[0] as StickyAtcSettings;
  return { shopId, ...DEFAULTS, updatedAt: new Date() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsert(db: any, shopId: string, patch: Partial<typeof DEFAULTS>): Promise<void> {
  const existing = await db
    .select()
    .from(schema.stickyAtcSettings)
    .where(eq(schema.stickyAtcSettings.shopId, shopId))
    .limit(1);
  const now = new Date();
  if (existing[0]) {
    await db
      .update(schema.stickyAtcSettings)
      .set({ ...patch, updatedAt: now })
      .where(eq(schema.stickyAtcSettings.shopId, shopId));
  } else {
    await db.insert(schema.stickyAtcSettings).values({
      shopId, ...DEFAULTS, ...patch, updatedAt: now,
    });
  }
}
