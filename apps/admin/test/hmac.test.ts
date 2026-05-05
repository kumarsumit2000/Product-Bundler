import { describe, it, expect } from "vitest";
import { verifyShopifyHmac } from "../app/lib/webhooks/hmac";

const SECRET = "test-secret";
const BODY = '{"shop":"test.myshopify.com"}';

async function makeHmac(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  let s = "";
  for (const b of new Uint8Array(sig)) s += String.fromCharCode(b);
  return btoa(s);
}

describe("verifyShopifyHmac", () => {
  it("returns true for a valid HMAC", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac(BODY, hmac, SECRET);
    expect(result).toBe(true);
  });

  it("returns false for a tampered body", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac('{"shop":"evil.myshopify.com"}', hmac, SECRET);
    expect(result).toBe(false);
  });

  it("returns false for a wrong secret", async () => {
    const hmac = await makeHmac(BODY, SECRET);
    const result = await verifyShopifyHmac(BODY, hmac, "wrong-secret");
    expect(result).toBe(false);
  });

  it("returns false for an empty hmac", async () => {
    const result = await verifyShopifyHmac(BODY, "", SECRET);
    expect(result).toBe(false);
  });

  it("returns false for null hmac", async () => {
    const result = await verifyShopifyHmac(BODY, null, SECRET);
    expect(result).toBe(false);
  });
});
