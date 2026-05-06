export async function purgeKvForShop(kv: KVNamespace, shop: string): Promise<void> {
  const indexList = await kv.list({ prefix: `shop-index:${shop}:` });
  await Promise.all(
    indexList.keys.map(async ({ name }) => {
      const sessionId = name.slice(`shop-index:${shop}:`.length);
      await kv.delete(`session:${sessionId}`);
      await kv.delete(name);
    }),
  );
}
