import { describe, it, expect } from "vitest";
import { encryptString, decryptString } from "../app/crypto.server";

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

describe("crypto.server", () => {
  it("encrypts and decrypts a string", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    expect(cipher).not.toBe(plain);
    const back = await decryptString(cipher, KEY_HEX);
    expect(back).toBe(plain);
  });

  it("produces different ciphertext for the same plaintext (random IV)", async () => {
    const plain = "shpat_abc123def456";
    const a = await encryptString(plain, KEY_HEX);
    const b = await encryptString(plain, KEY_HEX);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    const wrongKey = "ff" + KEY_HEX.slice(2);
    await expect(decryptString(cipher, wrongKey)).rejects.toThrow();
  });

  it("throws when ciphertext is tampered with", async () => {
    const plain = "shpat_abc123def456";
    const cipher = await encryptString(plain, KEY_HEX);
    const tampered = cipher.slice(0, -2) + "ff";
    await expect(decryptString(tampered, KEY_HEX)).rejects.toThrow();
  });
});
