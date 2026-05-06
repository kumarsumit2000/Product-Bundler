import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKV } from "./helpers/kv-mock";
import { purgeKvForShop } from "../app/lib/webhooks/cleanup";

describe("purgeKvForShop", () => {
  let kv: InMemoryKV;

  beforeEach(() => {
    kv = new InMemoryKV();
  });

  it("deletes all session and shop-index entries for a shop", async () => {
    await kv.put("session:offline_test.myshopify.com", "encrypted-blob-1");
    await kv.put("session:online_test.myshopify.com_user1", "encrypted-blob-2");
    await kv.put("shop-index:test.myshopify.com:offline_test.myshopify.com", "1");
    await kv.put("shop-index:test.myshopify.com:online_test.myshopify.com_user1", "1");
    await kv.put("session:offline_other.myshopify.com", "should-survive");
    await kv.put("shop-index:other.myshopify.com:offline_other.myshopify.com", "1");

    await purgeKvForShop(kv as unknown as KVNamespace, "test.myshopify.com");

    expect(await kv.get("session:offline_test.myshopify.com")).toBeNull();
    expect(await kv.get("session:online_test.myshopify.com_user1")).toBeNull();
    expect(await kv.get("shop-index:test.myshopify.com:offline_test.myshopify.com")).toBeNull();
    expect(await kv.get("shop-index:test.myshopify.com:online_test.myshopify.com_user1")).toBeNull();
    // Other shop's data must survive
    expect(await kv.get("session:offline_other.myshopify.com")).toBe("should-survive");
    expect(await kv.get("shop-index:other.myshopify.com:offline_other.myshopify.com")).toBe("1");
  });

  it("is a no-op when the shop has no entries", async () => {
    await kv.put("session:offline_other.myshopify.com", "untouched");
    await purgeKvForShop(kv as unknown as KVNamespace, "nonexistent.myshopify.com");
    expect(await kv.get("session:offline_other.myshopify.com")).toBe("untouched");
  });
});
