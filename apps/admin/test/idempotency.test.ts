import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryKV } from "./helpers/kv-mock";
import { wasProcessed, markProcessed } from "../app/lib/webhooks/idempotency";

function makeCtx(kv: InMemoryKV) {
  return {
    cloudflare: {
      env: {
        SHOP_SETTINGS_CACHE: kv as unknown as KVNamespace,
      },
    },
  } as unknown as Parameters<typeof wasProcessed>[0];
}

function makeRequest(webhookId: string | null): Request {
  const headers = new Headers();
  if (webhookId !== null) headers.set("X-Shopify-Webhook-Id", webhookId);
  return new Request("https://example.com/webhook", { method: "POST", headers });
}

describe("idempotency", () => {
  let kv: InMemoryKV;

  beforeEach(() => {
    kv = new InMemoryKV();
  });

  it("returns false when X-Shopify-Webhook-Id header is missing", async () => {
    const result = await wasProcessed(makeCtx(kv), makeRequest(null));
    expect(result).toBe(false);
  });

  it("returns false for an unseen webhook ID", async () => {
    const result = await wasProcessed(makeCtx(kv), makeRequest("wh-abc-123"));
    expect(result).toBe(false);
  });

  it("returns true after markProcessed", async () => {
    const ctx = makeCtx(kv);
    const req = makeRequest("wh-abc-123");
    await markProcessed(ctx, req);
    const result = await wasProcessed(ctx, req);
    expect(result).toBe(true);
  });

  it("treats different webhook IDs independently", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest("wh-id-1"));
    const result = await wasProcessed(ctx, makeRequest("wh-id-2"));
    expect(result).toBe(false);
  });

  it("sets a 7-day TTL when marking", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest("wh-ttl-test"));
    const opts = kv.getOptions("webhook-id:wh-ttl-test");
    expect(opts?.expirationTtl).toBe(60 * 60 * 24 * 7);
  });

  it("markProcessed is a no-op when header is missing", async () => {
    const ctx = makeCtx(kv);
    await markProcessed(ctx, makeRequest(null));
    const all = await kv.list();
    expect(all.keys.length).toBe(0);
  });
});
