import { eq } from "drizzle-orm";
import { schema } from "~/db.server";
import type { NewsletterSettings, NewsletterStyleOverrides } from "../../../drizzle/schema";

const DEFAULTS = {
  enabled: false,
  headline: "Get 10% off your first order",
  subtitle: "Join our newsletter for early access and exclusive deals.",
  placeholder: "you@email.com",
  ctaLabel: "Subscribe",
  successMessage: "Thanks! Check your inbox for the discount code.",
  tags: "newsletter,prospect",
  popupEnabled: false,
  popupTrigger: "delay",
  popupDelaySeconds: 5,
  popupScrollPercent: 50,
  popupFrequencyDays: 7,
  popupImageUrl: "",
  popupImagePosition: "none",
  excludedPaths: "",
  styleOverrides: null as NewsletterStyleOverrides | null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrDefault(db: any, shopId: string): Promise<NewsletterSettings> {
  const rows = await db
    .select()
    .from(schema.newsletterSettings)
    .where(eq(schema.newsletterSettings.shopId, shopId))
    .limit(1);
  if (rows[0]) return rows[0] as NewsletterSettings;
  return {
    shopId,
    ...DEFAULTS,
    updatedAt: new Date(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsert(db: any, shopId: string, patch: Partial<typeof DEFAULTS>): Promise<void> {
  const existing = await db
    .select()
    .from(schema.newsletterSettings)
    .where(eq(schema.newsletterSettings.shopId, shopId))
    .limit(1);
  const now = new Date();
  if (existing[0]) {
    await db
      .update(schema.newsletterSettings)
      .set({ ...patch, updatedAt: now })
      .where(eq(schema.newsletterSettings.shopId, shopId));
  } else {
    await db.insert(schema.newsletterSettings).values({
      shopId,
      ...DEFAULTS,
      ...patch,
      updatedAt: now,
    });
  }
}
