import { CaptureRecord, StoredImage } from '@pixelpeeper/schema';

/**
 * Local library: capture records (Recent + saved ideas), their images, and small settings.
 * IndexedDB in the extension's own origin; the background worker owns it and the Library
 * page opens the same database.
 */

export const RECENT_DAYS = 7;
export const RECENT_MAX = 20;
const DB_NAME = 'pixelpeeper';
const DB_VERSION = 1;

export interface CaptureImages { id: string; thumb: StoredImage | null; full: StoredImage | null }
export interface ListQuery { saved?: boolean; host?: string; limit?: number }
/** List rows carry everything except images. */
export type CaptureSummary = CaptureRecord;

const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const complete = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });

export class Store {
  private db: Promise<IDBDatabase> | null = null;
  constructor(private factory: IDBFactory = indexedDB, private now: () => number = Date.now) {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const r = this.factory.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        const captures = db.createObjectStore('captures', { keyPath: 'id' });
        captures.createIndex('host', 'page.host');
        captures.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('images', { keyPath: 'id' });
        db.createObjectStore('meta');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return this.db;
  }

  private async tx(stores: string[], mode: IDBTransactionMode) {
    return (await this.open()).transaction(stores, mode);
  }

  /**
   * Insert or update a capture. User decisions already stored win over the incoming copy:
   * saved state, an edited title and the note are never overwritten by a later lesson update.
   */
  async put(input: CaptureRecord, images?: Omit<CaptureImages, 'id'>): Promise<CaptureRecord> {
    const incoming = CaptureRecord.parse(input);
    const tx = await this.tx(['captures', 'images'], 'readwrite');
    const captures = tx.objectStore('captures');
    const existing = (await request(captures.get(incoming.id))) as CaptureRecord | undefined;
    const record: CaptureRecord = existing
      ? {
          ...incoming,
          createdAt: existing.createdAt,
          saved: existing.saved || incoming.saved,
          savedAt: existing.savedAt ?? incoming.savedAt,
          title: existing.titleSource === 'user' ? existing.title : incoming.title,
          titleSource: existing.titleSource === 'user' ? 'user' : incoming.titleSource,
          note: existing.note || incoming.note,
          hasImage: existing.hasImage || incoming.hasImage || !!images?.thumb,
        }
      : { ...incoming, hasImage: incoming.hasImage || !!images?.thumb };
    record.updatedAt = new Date(this.now()).toISOString();
    captures.put(record);
    if (images && (images.thumb || images.full)) tx.objectStore('images').put({ id: record.id, ...images });
    await complete(tx);
    await this.prune();
    return record;
  }

  /** Keep a capture as an idea. A title passed here that differs from the auto title is user authored. */
  async save(id: string, patch: { title?: string; note?: string } = {}): Promise<CaptureRecord | null> {
    const tx = await this.tx(['captures'], 'readwrite');
    const store = tx.objectStore('captures');
    const record = (await request(store.get(id))) as CaptureRecord | undefined;
    if (!record) { await complete(tx); return null; }
    const at = new Date(this.now()).toISOString();
    const title = patch.title?.trim();
    const next: CaptureRecord = {
      ...record,
      saved: true,
      savedAt: record.savedAt ?? at,
      updatedAt: at,
      ...(title && title !== record.title ? { title, titleSource: 'user' as const } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    };
    store.put(next);
    await complete(tx);
    return next;
  }

  async get(id: string): Promise<CaptureRecord | null> {
    const tx = await this.tx(['captures'], 'readonly');
    return ((await request(tx.objectStore('captures').get(id))) as CaptureRecord | undefined) ?? null;
  }

  /** Newest first. */
  async list(q: ListQuery = {}): Promise<CaptureSummary[]> {
    const tx = await this.tx(['captures'], 'readonly');
    const store = tx.objectStore('captures');
    const all = (await request(q.host ? store.index('host').getAll(q.host) : store.getAll())) as CaptureRecord[];
    return all
      .filter((r) => q.saved === undefined || r.saved === q.saved)
      .sort((a, b) => (b.savedAt ?? b.updatedAt).localeCompare(a.savedAt ?? a.updatedAt))
      .slice(0, q.limit ?? Infinity);
  }

  async delete(id: string): Promise<void> {
    const tx = await this.tx(['captures', 'images'], 'readwrite');
    tx.objectStore('captures').delete(id);
    tx.objectStore('images').delete(id);
    await complete(tx);
  }

  async images(ids: string[]): Promise<Record<string, CaptureImages>> {
    const tx = await this.tx(['images'], 'readonly');
    const store = tx.objectStore('images');
    const rows = await Promise.all(ids.map((id) => request(store.get(id)) as Promise<CaptureImages | undefined>));
    return Object.fromEntries(rows.filter((r): r is CaptureImages => !!r).map((r) => [r.id, r]));
  }

  /** Recent = unsaved captures, at most RECENT_MAX and none older than RECENT_DAYS. */
  async prune(): Promise<number> {
    const cutoff = new Date(this.now() - RECENT_DAYS * 864e5).toISOString();
    const recent = (await this.list({ saved: false }));
    const drop = recent.filter((r, i) => i >= RECENT_MAX || r.updatedAt < cutoff);
    if (!drop.length) return 0;
    const tx = await this.tx(['captures', 'images'], 'readwrite');
    for (const r of drop) { tx.objectStore('captures').delete(r.id); tx.objectStore('images').delete(r.id); }
    await complete(tx);
    return drop.length;
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const tx = await this.tx(['meta'], 'readonly');
    return (await request(tx.objectStore('meta').get(key))) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    const tx = await this.tx(['meta'], 'readwrite');
    tx.objectStore('meta').put(value, key);
    await complete(tx);
  }
}
