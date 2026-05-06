import { and, eq, desc } from "drizzle-orm";
import { schema } from "~/db.server";
import type { QuantityBreak } from "../../../drizzle/schema";

type CreateQbInput = Omit<QuantityBreak, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdateQbPatch = Partial<CreateQbInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listByShop(db: any, shopId: string): Promise<QuantityBreak[]> {
  return db
    .select()
    .from(schema.quantityBreaks)
    .where(eq(schema.quantityBreaks.shopId, shopId))
    .orderBy(desc(schema.quantityBreaks.updatedAt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getById(
  db: any,
  shopId: string,
  id: string,
): Promise<QuantityBreak | null> {
  const rows = await db
    .select()
    .from(schema.quantityBreaks)
    .where(and(eq(schema.quantityBreaks.shopId, shopId), eq(schema.quantityBreaks.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(
  db: any,
  shopId: string,
  input: CreateQbInput,
): Promise<QuantityBreak> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: QuantityBreak = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.quantityBreaks).values(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function update(
  db: any,
  shopId: string,
  id: string,
  patch: UpdateQbPatch,
): Promise<QuantityBreak | null> {
  const now = new Date();
  await db
    .update(schema.quantityBreaks)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.quantityBreaks.shopId, shopId), eq(schema.quantityBreaks.id, id)));
  return getById(db, shopId, id);
}
