import { and, eq, desc } from "drizzle-orm";
import { schema } from "~/db.server";
import type { BxgyOffer } from "../../../drizzle/schema";

type CreateBxgyInput = Omit<BxgyOffer, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdateBxgyPatch = Partial<CreateBxgyInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listByShop(db: any, shopId: string): Promise<BxgyOffer[]> {
  return db
    .select()
    .from(schema.bxgyOffers)
    .where(eq(schema.bxgyOffers.shopId, shopId))
    .orderBy(desc(schema.bxgyOffers.updatedAt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getById(db: any, shopId: string, id: string): Promise<BxgyOffer | null> {
  const rows = await db
    .select()
    .from(schema.bxgyOffers)
    .where(and(eq(schema.bxgyOffers.shopId, shopId), eq(schema.bxgyOffers.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(db: any, shopId: string, input: CreateBxgyInput): Promise<BxgyOffer> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: BxgyOffer = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.bxgyOffers).values(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function update(db: any, shopId: string, id: string, patch: UpdateBxgyPatch): Promise<BxgyOffer | null> {
  const now = new Date();
  await db
    .update(schema.bxgyOffers)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.bxgyOffers.shopId, shopId), eq(schema.bxgyOffers.id, id)));
  return getById(db, shopId, id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteById(db: any, shopId: string, id: string): Promise<void> {
  await db
    .delete(schema.bxgyOffers)
    .where(and(eq(schema.bxgyOffers.shopId, shopId), eq(schema.bxgyOffers.id, id)));
}
