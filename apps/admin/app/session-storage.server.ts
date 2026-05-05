import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { encryptString, decryptString } from "./crypto.server";

const SESSION_PREFIX = "session:";
const SHOP_INDEX_PREFIX = "shop-index:";
const TTL_SECONDS = 60 * 60 * 24 * 30;

type SerializedSession = {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  expires?: string;
  accessTokenEncrypted: string;
  onlineAccessInfo?: unknown;
};

export class KvSessionStorage implements SessionStorage {
  constructor(private kv: KVNamespace, private encryptionKeyHex: string) {}

  async storeSession(session: Session): Promise<boolean> {
    const encryptedToken = await encryptString(
      session.accessToken ?? "",
      this.encryptionKeyHex,
    );
    const serialized: SerializedSession = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires?.toISOString(),
      accessTokenEncrypted: encryptedToken,
      onlineAccessInfo: session.onlineAccessInfo,
    };
    await this.kv.put(SESSION_PREFIX + session.id, JSON.stringify(serialized), {
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
    const parsed = JSON.parse(raw) as SerializedSession;
    const accessToken = await decryptString(
      parsed.accessTokenEncrypted,
      this.encryptionKeyHex,
    );
    const session = new Session({
      id: parsed.id,
      shop: parsed.shop,
      state: parsed.state,
      isOnline: parsed.isOnline,
      accessToken,
      scope: parsed.scope,
    });
    if (parsed.expires) session.expires = new Date(parsed.expires);
    if (parsed.onlineAccessInfo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.onlineAccessInfo = parsed.onlineAccessInfo as any;
    }
    return session;
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
