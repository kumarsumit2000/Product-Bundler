export async function verifyShopifyHmac(
  body: string,
  hmacHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!hmacHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  let computed = "";
  for (const b of new Uint8Array(sigBuf)) computed += String.fromCharCode(b);
  const computedB64 = btoa(computed);

  if (computedB64.length !== hmacHeader.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computedB64.length; i++) {
    mismatch |= computedB64.charCodeAt(i) ^ hmacHeader.charCodeAt(i);
  }
  return mismatch === 0;
}
