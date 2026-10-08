/** Small TTL cache + in-flight de-duplication (a fetch that outlives its deadline still fills the cache). */
interface Entry<T> { exp: number; v: T }

export class TTLCache<T> {
  private m = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T | null>>();
  constructor(private max = 256) {}

  get(key: string): T | undefined {
    const e = this.m.get(key);
    if (!e) return undefined;
    if (e.exp < Date.now()) return void this.m.delete(key);
    return e.v;
  }
  set(key: string, v: T, ttlMs: number) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(key, { exp: Date.now() + ttlMs, v });
  }

  /** Cached value, or the shared in-flight promise producing it (null on failure; failures cached briefly). */
  ensure(key: string, ttlMs: number, factory: () => Promise<T>, negTtlMs = 45_000): T | Promise<T | null> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    let p = this.inflight.get(key);
    if (!p) {
      p = factory()
        .then((v) => (this.set(key, v, ttlMs), v))
        .catch((e) => {
          console.warn(`[cache] ${key} failed: ${String(e).slice(0, 120)}`);
          return null;
        })
        .finally(() => this.inflight.delete(key)) as Promise<T | null>;
      this.inflight.set(key, p);
    }
    return p;
  }
}

/** Await `value` for at most `ms`; resolves null on timeout (the underlying work keeps running). */
export async function within<T>(value: T | Promise<T | null> | undefined, ms: number): Promise<T | null> {
  if (value === undefined) return null;
  if (!(value instanceof Promise)) return value as T;
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((r) => (t = setTimeout(() => r(null), ms)));
  try {
    return await Promise.race([value, timeout]);
  } finally {
    clearTimeout(t!);
  }
}

export const cached = <T>(max = 64) => new TTLCache<T>(max);
