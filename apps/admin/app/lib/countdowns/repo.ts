import { and, eq, desc } from "drizzle-orm";
import { schema } from "~/db.server";
import type { CountdownTimer } from "../../../drizzle/schema";

type CreateInput = Omit<CountdownTimer, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdatePatch = Partial<CreateInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listByShop(db: any, shopId: string): Promise<CountdownTimer[]> {
  return db
    .select()
    .from(schema.countdownTimers)
    .where(eq(schema.countdownTimers.shopId, shopId))
    .orderBy(desc(schema.countdownTimers.updatedAt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getById(db: any, shopId: string, id: string): Promise<CountdownTimer | null> {
  const rows = await db
    .select()
    .from(schema.countdownTimers)
    .where(and(eq(schema.countdownTimers.shopId, shopId), eq(schema.countdownTimers.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(db: any, shopId: string, input: CreateInput): Promise<CountdownTimer> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: CountdownTimer = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.countdownTimers).values(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function update(db: any, shopId: string, id: string, patch: UpdatePatch): Promise<void> {
  await db
    .update(schema.countdownTimers)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.countdownTimers.shopId, shopId), eq(schema.countdownTimers.id, id)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteById(db: any, shopId: string, id: string): Promise<void> {
  await db
    .delete(schema.countdownTimers)
    .where(and(eq(schema.countdownTimers.shopId, shopId), eq(schema.countdownTimers.id, id)));
}
