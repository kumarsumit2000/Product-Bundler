import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { encryptString, decryptString } from "./crypto.server";

const SESSION_PREFIX = "session:";
const SHOP_INDEX_PREFIX = "shop-index:";
const TTL_SECONDS = 60 * 60 * 24 * 30;

const ACCESS_TOKEN_PROP = "accessToken";
const REFRESH_TOKEN_PROP = "refreshToken";

type StoredEnvelope = {
  // Full SessionParams as returned by session.toObject(), with sensitive token
  // fields swapped for their encrypted ciphertext. We never log this object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
};

export class KvSessionStorage implements SessionStorage {
  constructor(private kv: KVNamespace, private encryptionKeyHex: string) {}

  async storeSession(session: Session): Promise<boolean> {
    // Round-trip via toObject() so we capture every Session field the SDK uses
    // (accessToken, refreshToken, refreshTokenExpires, expires, scope,
    // onlineAccessInfo, etc.) without us tracking the schema by hand.
    const params = session.toObject() as Record<string, unknown>;

    if (typeof params[ACCESS_TOKEN_PROP] === "string" && params[ACCESS_TOKEN_PROP]) {
      params[ACCESS_TOKEN_PROP] = await encryptString(
        params[ACCESS_TOKEN_PROP] as string,
        this.encryptionKeyHex,
      );
    }
    if (typeof params[REFRESH_TOKEN_PROP] === "string" && params[REFRESH_TOKEN_PROP]) {
      params[REFRESH_TOKEN_PROP] = await encryptString(
        params[REFRESH_TOKEN_PROP] as string,
        this.encryptionKeyHex,
      );
    }

    const envelope: StoredEnvelope = { params };

    await this.kv.put(SESSION_PREFIX + session.id, JSON.stringify(envelope), {
      expirationTtl: TTL_SECONDS,
    });
    await this.kv.put(`${SHOP_INDEX_PREFIX}${session.shop}:${session.id}`, "1", {
      expirationTtl: TTL_SECONDS,
    });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const raw = await this.kv.get(SESSION_PREFIX + id);
    if (!raw) return undefined;
    const envelope = JSON.parse(raw) as StoredEnvelope;
    const params = { ...envelope.params } as Record<string, unknown>;

    if (typeof params[ACCESS_TOKEN_PROP] === "string" && params[ACCESS_TOKEN_PROP]) {
      params[ACCESS_TOKEN_PROP] = await decryptString(
        params[ACCESS_TOKEN_PROP] as string,
        this.encryptionKeyHex,
      );
    }
    if (typeof params[REFRESH_TOKEN_PROP] === "string" && params[REFRESH_TOKEN_PROP]) {
      params[REFRESH_TOKEN_PROP] = await decryptString(
        params[REFRESH_TOKEN_PROP] as string,
        this.encryptionKeyHex,
      );
    }
    if (typeof params.expires === "string") {
      params.expires = new Date(params.expires);
    }
    if (typeof params.refreshTokenExpires === "string") {
      params.refreshTokenExpires = new Date(params.refreshTokenExpires);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Session(params as any);
  }

  async deleteSession(id: string): Promise<boolean> {
    const existing = await this.loadSession(id);
    await this.kv.delete(SESSION_PREFIX + id);
    if (existing) {
      await this.kv.delete(`${SHOP_INDEX_PREFIX}${existing.shop}:${id}`);
    }
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await Promise.all(ids.map((id) => this.deleteSession(id)));
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const list = await this.kv.list({ prefix: `${SHOP_INDEX_PREFIX}${shop}:` });
    const ids = list.keys.map((k) => k.name.slice(`${SHOP_INDEX_PREFIX}${shop}:`.length));
    const sessions = await Promise.all(ids.map((id) => this.loadSession(id)));
    return sessions.filter((s): s is Session => s !== undefined);
  }
}
