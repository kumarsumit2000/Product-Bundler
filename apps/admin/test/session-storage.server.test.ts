import { describe, it, expect, beforeEach } from "vitest";
import { Session } from "@shopify/shopify-api";
import { KvSessionStorage } from "../app/session-storage.server";
import { InMemoryKV } from "./helpers/kv-mock";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

function makeSession(id = "offline_test.myshopify.com"): Session {
  return new Session({
    id,
    shop: "test.myshopify.com",
    state: "test-state",
    isOnline: false,
    accessToken: "shpat_secret_token",
    scope: "read_products",
  });
}

describe("KvSessionStorage", () => {
  let kv: InMemoryKV;
  let storage: KvSessionStorage;

  beforeEach(() => {
    kv = new InMemoryKV();
    storage = new KvSessionStorage(kv as unknown as KVNamespace, KEY_HEX);
  });

  it("stores and loads a session round-trip", async () => {
    const sess = makeSession();
    const stored = await storage.storeSession(sess);
    expect(stored).toBe(true);

    const loaded = await storage.loadSession(sess.id);
    expect(loaded).toBeDefined();
    expect(loaded!.shop).toBe("test.myshopify.com");
    expect(loaded!.accessToken).toBe("shpat_secret_token");
  });

  it("encrypts the access token at rest", async () => {
    const sess = makeSession();
    await storage.storeSession(sess);

    const raw = kv.rawGet(`session:${sess.id}`);
    expect(raw).toBeDefined();
    expect(raw).not.toContain("shpat_secret_token");
  });

  it("returns undefined for an unknown session id", async () => {
    const loaded = await storage.loadSession("offline_unknown.myshopify.com");
    expect(loaded).toBeUndefined();
  });

  it("deletes a session", async () => {
    const sess = makeSession();
    await storage.storeSession(sess);
    const deleted = await storage.deleteSession(sess.id);
    expect(deleted).toBe(true);
    const loaded = await storage.loadSession(sess.id);
    expect(loaded).toBeUndefined();
  });

  it("finds sessions by shop", async () => {
    const a = makeSession("offline_test.myshopify.com");
    const b = new Session({
      id: "online_test.myshopify.com_user1",
      shop: "test.myshopify.com",
      state: "s",
      isOnline: true,
      accessToken: "shpat_b",
      scope: "read_products",
    });
    await storage.storeSession(a);
    await storage.storeSession(b);
    const found = await storage.findSessionsByShop("test.myshopify.com");
    expect(found.length).toBe(2);
    expect(found.some((s) => s.id === a.id)).toBe(true);
    expect(found.some((s) => s.id === b.id)).toBe(true);
  });

  it("deletes multiple sessions", async () => {
    const a = makeSession("offline_a.myshopify.com");
    const b = makeSession("offline_b.myshopify.com");
    await storage.storeSession(a);
    await storage.storeSession(b);
    const deleted = await storage.deleteSessions([a.id, b.id]);
    expect(deleted).toBe(true);
    expect(await storage.loadSession(a.id)).toBeUndefined();
    expect(await storage.loadSession(b.id)).toBeUndefined();
  });
});
