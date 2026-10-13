import { describe, expect, it } from 'vitest';
import { captureTitle, measureElement, pageInfo, patternName } from '@pixelpeeper/measure';
import type { CaptureRecord } from '@pixelpeeper/schema';
import { compareRows } from './direction';
import { applyFilter, compareView, groupBySite, homeView, ideaView, matches } from './library-view';

function rec(id: string, html: string, over: Partial<CaptureRecord> = {}, host = 'localhost'): CaptureRecord {
  document.body.innerHTML = html;
  const facts = measureElement(document.getElementById('t')!);
  const page = { ...pageInfo(document), host, siteName: host === 'localhost' ? 'Localhost' : 'Stripe', pageName: 'Pricing' };
  const pattern = patternName(facts, 'element');
  const at = '2026-10-13T10:00:00.000Z';
  return { id, createdAt: at, updatedAt: at, scope: 'element', page, facts, analysis: null, pattern, title: captureTitle(pattern, page), titleSource: 'auto', saved: true, savedAt: at, note: '', hasImage: false, ...over };
}
const button = (id: string, over: Partial<CaptureRecord> = {}, host?: string) => rec(id, '<button id="t" style="color:#000;background:#fff;font-size:16px;line-height:24px">Buy now</button>', over, host);
const tiny = (id: string) => rec(id, '<button id="t" style="color:#bbb;background:#fff;font-size:10px">x</button>');

describe('library home', () => {
  it('searches across title, site, page and note', () => {
    const r = button('a', { note: 'use on onboarding' }, 'stripe.com');
    expect(matches(r, 'stripe pricing')).toBe(true);
    expect(matches(r, 'onboarding')).toBe(true);
    expect(matches(r, 'buy')).toBe(true);
    expect(matches(r, 'linear')).toBe(false);
  });
  it('filters by scope and by measured issues', () => {
    const records = [button('ok'), tiny('bad'), button('page', { scope: 'page' })];
    expect(applyFilter(records, 'issues', '').map((r) => r.id)).toContain('bad');
    expect(applyFilter(records, 'issues', '').map((r) => r.id)).not.toContain('ok');
    expect(applyFilter(records, 'page', '').map((r) => r.id)).toEqual(['page']);
  });
  it('groups ideas by site', () => {
    const groups = groupBySite([button('a', {}, 'stripe.com'), button('b'), button('c', {}, 'stripe.com')]);
    expect(groups.map((g) => [g.site, g.items.length])).toEqual([['Stripe', 2], ['Localhost', 1]]);
  });
  it('shows Recent separately with Save, ideas with Compare, and an empty state', () => {
    const html = homeView({ records: [button('idea'), button('recent', { saved: false, savedAt: null })], thumbs: {}, filter: 'all', query: '', selected: [] });
    expect(html).toContain('Recent');
    expect(html).toContain('data-keep="recent"');
    expect(html).toContain('data-select="idea"');
    expect(homeView({ records: [], thumbs: {}, filter: 'all', query: '', selected: [] })).toContain('Your library is empty');
  });
  it('limits compare to three', () => {
    const records = ['a', 'b', 'c', 'd'].map((id) => button(id));
    const html = homeView({ records, thumbs: {}, filter: 'all', query: '', selected: ['a', 'b', 'c'] });
    expect(html).toMatch(/data-select="d"[^>]*disabled/);
    expect(html).toContain('3 of 3 selected');
  });
});

describe('idea page', () => {
  it('shows the editable title, source link, note and tabs; explains a missing lesson and screenshot', () => {
    const html = ideaView({ record: button('a', { note: 'my <note>' }), image: null, tab: 'lesson', selected: [] });
    expect(html).toContain('data-title value="Button “Buy now” — Localhost · Pricing"');
    expect(html).toContain('Open source page');
    expect(html).toContain('my &lt;note&gt;');
    expect(html).toContain('No lesson for this capture');
    expect(html).toContain('No screenshot was taken');
    expect(html).toContain('Add to compare');
  });
  it('offers Save for a Recent capture instead of compare', () => {
    const html = ideaView({ record: button('a', { saved: false, savedAt: null }), image: 'data:image/jpeg;base64,AAAA', tab: 'rules', selected: [] });
    expect(html).toContain('data-keep="a"');
    expect(html).not.toContain('Add to compare');
    expect(html).toContain('<img src="data:image/jpeg;base64,AAAA"');
  });
});

describe('compare', () => {
  it('lines up measured values and marks the rows that differ', () => {
    const rows = compareRows([button('a'), tiny('b')]);
    const size = rows.find((r) => r.label === 'Font size')!;
    expect(size.differs).toBe(true);
    expect(rows.find((r) => r.label === 'Font')!.differs).toBe(false);
  });
  it('renders columns, the diff table, borrow choices and the export', () => {
    const html = compareView({ items: [button('a'), tiny('b')], thumbs: {}, sources: { Color: 1 }, format: 'css' });
    expect(html).toContain('Compare 2 ideas');
    expect(html).toContain('class="differs"');
    expect(html).toMatch(/name="Color" value="1" checked/);
    expect(html).toContain(':root {');
  });
});
