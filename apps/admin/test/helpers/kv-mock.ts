export class InMemoryKV {
  private store = new Map<string, { value: string; metadata?: unknown; expirationTtl?: number }>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key)?.value ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown },
  ): Promise<void> {
    this.store.set(key, { value, ...options });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list({ prefix }: { prefix?: string } = {}): Promise<{ keys: { name: string }[] }> {
    const all = Array.from(this.store.keys());
    const filtered = prefix ? all.filter((k) => k.startsWith(prefix)) : all;
    return { keys: filtered.map((name) => ({ name })) };
  }

  rawGet(key: string): string | null {
    return this.store.get(key)?.value ?? null;
  }

  getOptions(key: string): { expirationTtl?: number } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { expirationTtl: entry.expirationTtl };
  }
}
