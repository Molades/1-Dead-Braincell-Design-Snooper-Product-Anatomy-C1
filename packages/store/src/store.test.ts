import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { measureElement, pageInfo } from '@pixelpeeper/measure';
import type { CaptureRecord } from '@pixelpeeper/schema';
import { RECENT_MAX, Store } from './index';

document.body.innerHTML = '<button id="t">Go</button>';
const facts = measureElement(document.getElementById('t')!);
const page = pageInfo(document);
const thumb = { base64: 'AAAA', mediaType: 'image/jpeg' as const, width: 4, height: 3 };

function record(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  const at = '2026-10-13T10:00:00.000Z';
  return { id, createdAt: at, updatedAt: at, scope: 'element', page, facts, analysis: null, pattern: 'Button', title: `Button — ${page.siteName} · ${page.pageName}`, titleSource: 'auto', saved: false, savedAt: null, note: '', hasImage: false, ...over };
}
let clock = Date.parse('2026-10-13T10:00:00Z');
const store = () => new Store(new IDBFactory(), () => clock);

describe('store', () => {
  it('puts, gets and lists captures with their images', async () => {
    const s = store();
    await s.put(record('a'), { thumb, full: null });
    expect((await s.get('a'))!.hasImage).toBe(true);
    expect((await s.images(['a', 'missing'])).a!.thumb).toEqual(thumb);
    expect(await s.list()).toHaveLength(1);
  });

  it('saves with a user title and keeps user decisions when a later lesson updates the capture', async () => {
    const s = store();
    await s.put(record('a'));
    await s.save('a', { title: 'My favourite CTA', note: 'Use on landing page' });
    await s.put(record('a', { title: 'Plan call-to-action — Northwind · Pricing', pattern: 'Plan call-to-action' }));
    const r = (await s.get('a'))!;
    expect(r.saved).toBe(true);
    expect(r.title).toBe('My favourite CTA');
    expect(r.titleSource).toBe('user');
    expect(r.note).toBe('Use on landing page');
    expect(r.pattern).toBe('Plan call-to-action');
  });

  it('keeps the auto title fresh until the user edits it', async () => {
    const s = store();
    await s.put(record('a'));
    await s.save('a');
    await s.put(record('a', { title: 'Plan call-to-action — X · Y' }));
    expect((await s.get('a'))!.title).toBe('Plan call-to-action — X · Y');
  });

  it('filters by saved state and host', async () => {
    const s = store();
    await s.put(record('a'));
    await s.put(record('b'));
    await s.save('b');
    expect((await s.list({ saved: true })).map((r) => r.id)).toEqual(['b']);
    expect((await s.list({ saved: false })).map((r) => r.id)).toEqual(['a']);
    expect(await s.list({ host: 'elsewhere.com' })).toHaveLength(0);
    expect(await s.list({ host: page.host })).toHaveLength(2);
  });

  it('deletes a capture and its images', async () => {
    const s = store();
    await s.put(record('a'), { thumb, full: thumb });
    await s.delete('a');
    expect(await s.get('a')).toBeNull();
    expect(await s.images(['a'])).toEqual({});
  });

  it('prunes Recent to the newest 20 and drops anything older than 7 days, but never ideas', async () => {
    const s = store();
    clock = Date.parse('2026-10-01T10:00:00Z');
    await s.put(record('old'));
    await s.put(record('old-idea'));
    await s.save('old-idea');
    clock = Date.parse('2026-10-13T10:00:00Z');
    for (let i = 0; i < RECENT_MAX + 3; i++) { clock += 1000; await s.put(record(`r${i}`)); }
    const recent = await s.list({ saved: false });
    expect(recent).toHaveLength(RECENT_MAX);
    expect(recent.some((r) => r.id === 'old' || r.id === 'r0')).toBe(false);
    expect((await s.get('old-idea'))!.saved).toBe(true);
  });

  it('rejects malformed records', async () => {
    await expect(store().put({ id: 'x' } as never)).rejects.toThrow();
  });

  it('stores small settings', async () => {
    const s = store();
    await s.setMeta('profile', { level: 'student' });
    expect(await s.getMeta('profile')).toEqual({ level: 'student' });
  });
});
