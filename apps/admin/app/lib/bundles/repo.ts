import { and, eq, desc } from "drizzle-orm";
import { schema } from "~/db.server";
import type { Bundle } from "../../../drizzle/schema";

type CreateBundleInput = Omit<Bundle, "id" | "shopId" | "createdAt" | "updatedAt">;
type UpdateBundlePatch = Partial<CreateBundleInput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listByShop(db: any, shopId: string): Promise<Bundle[]> {
  return db
    .select()
    .from(schema.bundles)
    .where(eq(schema.bundles.shopId, shopId))
    .orderBy(desc(schema.bundles.updatedAt));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getById(
  db: any,
  shopId: string,
  id: string,
): Promise<Bundle | null> {
  const rows = await db
    .select()
    .from(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function create(
  db: any,
  shopId: string,
  input: CreateBundleInput,
): Promise<Bundle> {
  const id = crypto.randomUUID();
  const now = new Date();
  const row: Bundle = { ...input, id, shopId, createdAt: now, updatedAt: now };
  await db.insert(schema.bundles).values(row);
  return row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function update(
  db: any,
  shopId: string,
  id: string,
  patch: UpdateBundlePatch,
): Promise<Bundle | null> {
  const now = new Date();
  await db
    .update(schema.bundles)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)));
  return getById(db, shopId, id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteById(
  db: any,
  shopId: string,
  id: string,
): Promise<void> {
  await db
    .delete(schema.bundles)
    .where(and(eq(schema.bundles.shopId, shopId), eq(schema.bundles.id, id)));
}
