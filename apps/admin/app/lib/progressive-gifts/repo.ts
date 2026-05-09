import { and, eq, desc } from "drizzle-orm";
import { schema } from "~/db.server";
import type { ProgressiveGift } from "../../../drizzle/schema";

type CreateInput = Omit<ProgressiveGift, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdatePatch = Partial<CreateInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listByShop(db: any, shopId: string): Promise<ProgressiveGift[]> {
  return db
    .select()
    .from(schema.progressiveGifts)
    .where(eq(schema.progressiveGifts.shopId, shopId))
    .orderBy(desc(schema.progressiveGifts.updatedAt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getById(
  db: any,
  shopId: string,
  id: string,
): Promise<ProgressiveGift | null> {
  const rows = await db
    .select()
    .from(schema.progressiveGifts)
    .where(and(eq(schema.progressiveGifts.shopId, shopId), eq(schema.progressiveGifts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(
  db: any,
  shopId: string,
  input: CreateInput,
): Promise<ProgressiveGift> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: ProgressiveGift = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.progressiveGifts).values(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function update(
  db: any,
  shopId: string,
  id: string,
  patch: UpdatePatch,
): Promise<ProgressiveGift | null> {
  const now = new Date();
  await db
    .update(schema.progressiveGifts)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.progressiveGifts.shopId, shopId), eq(schema.progressiveGifts.id, id)));
  return getById(db, shopId, id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteById(
  db: any,
  shopId: string,
  id: string,
): Promise<void> {
  await db
    .delete(schema.progressiveGifts)
    .where(and(eq(schema.progressiveGifts.shopId, shopId), eq(schema.progressiveGifts.id, id)));
}
