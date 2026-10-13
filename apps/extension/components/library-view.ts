import { evaluate } from '@pixelpeeper/rules';
import type { CaptureRecord } from '@pixelpeeper/schema';
import { evaluate as evaluateRules } from '@pixelpeeper/rules';
import type { Insight } from '@pixelpeeper/schema';
import { buildDirection, categoryValue, CATEGORIES, CATEGORY_LABELS, compareRows, exportText, FORMAT_LABELS, type Choices, type ExportExtras, type Format } from './direction';
import { describeEvidence, errorCard, type LessonError } from './lesson';
import { esc, lessonTab, measurementsTab, rulesTab, tabs, type Tab } from './lesson';
import { issueCount } from './viewer';

/** Library tab screens: Home, Idea and Compare. Pure functions returning HTML. */

export type Filter = 'all' | 'element' | 'page' | 'issues';
export interface Thumbs { [id: string]: string | undefined } // data URLs
export const MAX_COMPARE = 3;

const TECHNIQUE: Record<string, string> = {
  contrast: 'Contrast', size: 'Size', color: 'Color', isolation: 'Isolation', position: 'Position', weight: 'Weight',
  shape: 'Shape', spacing: 'Spacing', repetition: 'Repetition', imagery: 'Imagery', restraint: 'Restraint',
};
const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const failCount = (r: CaptureRecord) => evaluate(r.facts, { scope: r.scope }).filter((x) => x.label === 'measured' && x.status === 'fail').length;

/** Case-insensitive match over everything a user might remember an idea by. */
export function matches(r: CaptureRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [r.title, r.pattern, r.page.siteName, r.page.pageName, r.page.host, r.note, r.analysis?.technique?.tag,
    r.analysis?.headline?.text, ...(r.analysis?.vocabulary.map((v) => v.term) ?? [])].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function applyFilter(records: CaptureRecord[], filter: Filter, query: string): CaptureRecord[] {
  return records.filter((r) => matches(r, query) && (filter === 'all' || (filter === 'issues' ? failCount(r) > 0 : r.scope === filter)));
}

/** Ideas grouped by site, sites ordered by their most recent idea. */
export function groupBySite(records: CaptureRecord[]): { site: string; host: string; favicon: string | null; items: CaptureRecord[] }[] {
  const groups = new Map<string, { site: string; host: string; favicon: string | null; items: CaptureRecord[] }>();
  for (const r of records) {
    const g = groups.get(r.page.host) ?? { site: r.page.siteName, host: r.page.host, favicon: r.page.favicon, items: [] };
    g.items.push(r);
    groups.set(r.page.host, g);
  }
  return [...groups.values()];
}

function card(r: CaptureRecord, thumbs: Thumbs, selected: string[]): string {
  const fails = failCount(r);
  const tech = r.analysis?.technique?.tag;
  const thumb = thumbs[r.id];
  const isSel = selected.includes(r.id);
  return `<article class="card${isSel ? ' selected' : ''}">
    <a class="card-open" href="#/idea/${encodeURIComponent(r.id)}">
      <div class="thumb">${thumb ? `<img src="${thumb}" alt="">` : `<span class="no-shot">${r.scope === 'page' ? 'Page' : 'No screenshot'}</span>`}</div>
      <div class="card-meta"><strong>${esc(r.titleSource === 'user' ? r.title : r.pattern)}</strong><span>${esc(r.page.pageName)} · ${day(r.savedAt ?? r.updatedAt)}</span>
      <span class="chips">${tech ? `<span class="chip">${esc(TECHNIQUE[tech] ?? tech)}</span>` : ''}${fails ? `<span class="chip fail">${fails} issue${fails > 1 ? 's' : ''}</span>` : ''}${r.note ? '<span class="chip note">Note</span>' : ''}</span></div>
    </a>
    ${r.saved ? `<label class="pick"><input type="checkbox" data-select="${esc(r.id)}" ${isSel ? 'checked' : ''} ${!isSel && selected.length >= MAX_COMPARE ? 'disabled' : ''}> Compare</label>` : `<button class="keep" data-keep="${esc(r.id)}">Save</button>`}
  </article>`;
}

export interface HomeState { records: CaptureRecord[]; thumbs: Thumbs; filter: Filter; query: string; selected: string[] }

export function homeView(s: HomeState): string {
  const visible = applyFilter(s.records, s.filter, s.query);
  const ideas = visible.filter((r) => r.saved);
  const recent = visible.filter((r) => !r.saved);
  const count = (f: Filter) => applyFilter(s.records, f, '').length;
  const filters = (['all', 'element', 'page', 'issues'] as Filter[])
    .map((f) => `<button class="filter" data-filter="${f}" aria-pressed="${s.filter === f}">${{ all: 'All', element: 'Elements', page: 'Visible pages', issues: 'Has issues' }[f]} <span>${count(f)}</span></button>`).join('');
  const empty = !s.records.length
    ? `<div class="empty"><h2>Your library is empty</h2><p>Open any website, click the Pixel Peeper icon, pick something you like and choose <b>Get lesson</b>. Every lesson lands here under Recent; save the ones you want to keep.</p></div>`
    : !visible.length ? `<div class="empty"><h2>Nothing matches</h2><p>Try another word, or clear the filter.</p><button data-action="clear-search">Clear search</button></div>` : '';
  return `<div class="toolbar-row"><input type="search" class="search" placeholder="Search site, page, pattern, term or note" value="${esc(s.query)}" aria-label="Search the library"><div class="filters" role="group" aria-label="Filter">${filters}</div></div>
    ${empty}
    ${recent.length ? `<section class="block"><h2>Recent <small>not saved · kept 7 days</small></h2><div class="grid">${recent.map((r) => card(r, s.thumbs, s.selected)).join('')}</div></section>` : ''}
    ${ideas.length ? `<section class="block"><h2>Ideas <small>${ideas.length}</small></h2>${groupBySite(ideas).map((g) => `<div class="site"><h3>${g.favicon ? `<img class="fav" src="${esc(g.favicon)}" alt="">` : ''}<span class="fav-fallback" aria-hidden="true">${esc(g.site.charAt(0))}</span>${esc(g.site)} <small>${g.items.length}</small></h3><div class="grid">${g.items.map((r) => card(r, s.thumbs, s.selected)).join('')}</div></div>`).join('')}</section>` : ''}
    <div class="selbar" ${s.selected.length ? '' : 'hidden'}><span>${s.selected.length} of ${MAX_COMPARE} selected</span><button data-action="clear-select">Clear</button><button class="primary" data-action="compare" ${s.selected.length < 2 ? 'disabled' : ''}>Compare</button></div>`;
}

export interface IdeaState { record: CaptureRecord; image: string | null; tab: Tab; selected: string[] }

export function ideaView(s: IdeaState): string {
  const r = s.record;
  const results = evaluate(r.facts, { scope: r.scope });
  const body = s.tab === 'rules' ? rulesTab(results, r.scope)
    : s.tab === 'measurements' ? measurementsTab(r.facts, r.scope)
    : r.analysis ? lessonTab(r.analysis, r.facts, results)
    : `<div class="err info"><strong>No lesson for this capture</strong><p>It was measured without an AI key, so Rules and Measurements are available but there is no lesson. Pick it again on its page with a key set to get one.</p></div>`;
  const inCompare = s.selected.includes(r.id);
  return `<div class="idea">
    <div class="idea-head">
      <a class="back" href="#/">← Library</a>
      <input class="title-input" data-title value="${esc(r.title)}" aria-label="Title" spellcheck="false">
      <p class="muted">${esc(r.page.siteName)} · ${esc(r.page.pageName)} · ${r.scope === 'page' ? 'visible page' : `&lt;${esc(r.facts.structure.tag.value)}&gt;`} · captured ${when(r.createdAt)} · <a href="${esc(r.page.url)}" target="_blank" rel="noopener">Open source page ↗</a></p>
      <div class="actions">${r.saved ? '<span class="saved-state">✓ Saved</span>' : `<button class="primary" data-keep="${esc(r.id)}">Save idea</button>`}${r.saved ? `<button data-toggle-compare="${esc(r.id)}" aria-pressed="${inCompare}">${inCompare ? '✓ In compare' : 'Add to compare'}</button>` : ''}${s.image ? `<button data-view="${esc(r.id)}">View annotated</button>` : ''}<button data-export="${esc(r.id)}">Export</button><button class="danger" data-delete="${esc(r.id)}">Delete</button></div>
    </div>
    <div class="idea-body">
      <figure class="shot-big">${s.image ? `<button class="shot-open" data-view="${esc(r.id)}" aria-label="Open full screen with measured annotations"><img src="${s.image}" alt="Captured screenshot of ${esc(r.pattern)}"><span class="shot-hint">View with measurements${issueCount(r.annotations) ? ` · ${issueCount(r.annotations)} issue${issueCount(r.annotations) > 1 ? 's' : ''}` : ''}</span></button>` : `<div class="no-shot">No screenshot was taken. Screenshots are captured when a lesson runs with an AI key.</div>`}<figcaption>What was analysed · ${esc(r.page.siteName)} · ${when(r.createdAt)}</figcaption></figure>
      <section class="lesson-col">
        ${tabs(s.tab, results, true)}
        <div class="panel" role="tabpanel">${body}</div>
        <label class="note"><span>Your note <em>User authored</em></span><textarea data-note rows="3" placeholder="Why you kept this, where you might use it…">${esc(r.note).replace(/^Unavailable$/, '')}</textarea></label>
      </section>
    </div>
  </div>`;
}

export interface CompareState {
  items: CaptureRecord[];
  thumbs: Thumbs;
  choices: Choices;
  format: Format;
  readAcross: Insight | null;
  rationale: { text: string; source: 'inferred' | 'user' } | null;
  /** Which AI request is running, and the last error. */
  busy: 'readAcross' | 'rationale' | null;
  error: (LessonError & { mode: 'readAcross' | 'rationale' }) | null;
  hasKey: boolean;
}

/** "A:typography.fontSize" → "A · Font size 16px". */
function letterChip(e: string, items: CaptureRecord[]): string {
  const m = e.match(/^([ABC]):(.+)$/);
  const i = m ? 'ABC'.indexOf(m[1]!) : -1;
  if (!m || i < 0 || !items[i]) return '';
  const d = describeEvidence(m[2]!, items[i]!.facts, evaluateRules(items[i]!.facts, { scope: items[i]!.scope }));
  return d ? `<span class="ev" title="Measured">${m[1]} · ${esc(d.label)} <b>${d.value}</b></span>` : '';
}

function insightBlock(s: CompareState): string {
  if (s.busy === 'readAcross') return '<p class="pending">Comparing the ideas… This sends their measured values and earlier lessons as text, no screenshots.</p>';
  if (s.error?.mode === 'readAcross') return errorCard(s.error, Date.now()).replace('data-action="retry"', 'data-action="explain"');
  if (!s.readAcross) {
    return s.hasKey
      ? '<p class="muted">Ask for a read-across of why these feel different and what each suits. Uses one AI request; the result is kept with this comparison.</p><button class="primary" data-action="explain">Explain the differences</button>'
      : '<p class="muted">Add an API key in settings to get an AI read-across. The measured comparison above works without one.</p><button data-action="settings">Open settings</button>';
  }
  const r = s.readAcross;
  const point = (c: Insight['claims'][number]) => `<div class="point">${c.title ? `<strong>${esc(c.title)}</strong>` : ''}<p>${esc(c.text)}</p><div class="evs">${c.evidence.map((e) => letterChip(e, s.items)).join('')}</div></div>`;
  return `${r.claims.map(point).join('') || '<p class="muted">No supported differences came back. Try again.</p>'}
    ${r.bestFor.length ? `<h3 class="sub">Suits</h3>${r.bestFor.map((c) => `<div class="point"><strong><span class="letter-inline">${esc(c.tag)}</span> ${esc(c.title ?? '')}</strong><p>${esc(c.text)}</p><div class="evs">${c.evidence.map((e) => letterChip(e, s.items)).join('')}</div></div>`).join('')}` : ''}
    <p class="meta">${esc(r.modelInfo.provider)} · ${esc(r.modelInfo.model)}${r.rejected.length ? ` · ${r.rejected.length} unsupported claim${r.rejected.length > 1 ? 's' : ''} removed` : ''} · <button class="link" data-action="explain">Ask again</button></p>`;
}

function rationaleBlock(s: CompareState): string {
  const label = s.rationale?.source === 'user' ? '<span class="badge user">User authored</span>' : s.rationale ? '<span class="badge inferred">Inferred · AI draft</span>' : '';
  const action = s.busy === 'rationale' ? '<p class="pending">Drafting a rationale for your choices…</p>'
    : s.error?.mode === 'rationale' ? errorCard(s.error, Date.now()).replace('data-action="retry"', 'data-action="draft"')
    : s.hasKey ? `<button data-action="draft">${s.rationale ? 'Redraft with AI' : 'Draft rationale with AI'}</button>` : '';
  return `<div class="rationale-head">${label}${action}</div>
    <textarea data-rationale rows="5" placeholder="Why these choices belong together, where you will use them…">${esc(s.rationale?.text ?? '')}</textarea>
    <p class="muted">Editing an AI draft makes it yours: it is then exported as User authored.</p>`;
}

export function compareView(s: CompareState): string {
  const letters = 'ABC';
  const rows = compareRows(s.items);
  const d = buildDirection(s.items, s.choices);
  const c = d.contrast;
  const contrast = !c ? '<p class="contrast neutral">Contrast not checked: text color or background is omitted.</p>'
    : !c.canMeasure ? `<p class="contrast neutral">Contrast can’t be measured: ${esc(c.reason)}</p>`
    : `<p class="contrast ${c.aa ? 'ok' : 'bad'}"><span class="badge">Measured</span> ${c.newPairing ? `<b>New pairing</b>: text from ${c.textFrom} on background from ${c.backgroundFrom}` : `Text and background from ${c.textFrom}`} · <b>${c.ratio}:1</b> · AA ${c.aa ? 'pass' : 'fail'} · AAA ${c.aaa ? 'pass' : 'fail'}${c.newPairing ? ' · recomputed for this combination' : ''}</p>`;
  const extras: ExportExtras = { readAcross: s.readAcross, rationale: s.rationale };
  return `<div class="compare">
    <a class="back" href="#/">← Library</a>
    <h1>Compare ${s.items.length} ideas</h1>
    <div class="cols" style="--n:${s.items.length}">${s.items.map((r, n) => `<div class="col"><span class="letter">${letters[n]}</span><div class="thumb">${s.thumbs[r.id] ? `<img src="${s.thumbs[r.id]}" alt="">` : '<span class="no-shot">No screenshot</span>'}</div><strong>${esc(r.titleSource === 'user' ? r.title : r.pattern)}</strong><span class="muted">${esc(r.page.siteName)} · ${esc(r.page.pageName)}</span>${r.analysis?.headline ? `<p class="hl"><span class="badge inferred">Inferred</span> ${esc(r.analysis.headline.text)}</p>` : ''}</div>`).join('')}</div>
    <h2><span class="badge">Measured</span> Side by side</h2>
    <table class="diff"><thead><tr><th></th>${s.items.map((_, n) => `<th>${letters[n]}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr class="${row.differs ? 'differs' : ''}"><th>${esc(row.label)}</th>${row.values.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted">Highlighted rows differ.</p>
    <h2><span class="badge inferred">Inferred</span> Why these feel different</h2>
    <div class="insight">${insightBlock(s)}</div>
    <h2>Build your direction</h2>
    <div class="borrow">${CATEGORIES.map((cat) => {
      const chosen = s.choices[cat] ?? 0;
      return `<fieldset><legend>${CATEGORY_LABELS[cat]}</legend>${s.items.map((it, n) => `<label class="opt"><input type="radio" name="${cat}" value="${n}" ${chosen === n ? 'checked' : ''}><span class="letter-inline">${letters[n]}</span><span class="val">${cat === 'textColor' || cat === 'background' ? `<i class="sw" style="background:${esc(categoryValue(it, cat))}"></i>` : ''}${esc(categoryValue(it, cat))}</span></label>`).join('')}<label class="opt omit"><input type="radio" name="${cat}" value="omit" ${chosen === 'omit' ? 'checked' : ''}><span class="val">Leave out</span></label></fieldset>`;
    }).join('')}</div>
    ${contrast}
    <h2>Rationale</h2>
    <div class="rationale">${rationaleBlock(s)}</div>
    <h2>Export your direction</h2>
    <div class="formats">${(['md', 'json', 'css'] as const).map((f) => `<button data-format="${f}" aria-pressed="${s.format === f}">${FORMAT_LABELS[f]}</button>`).join('')}</div>
    <pre>${esc(exportText(s.items, s.choices, s.format, extras))}</pre>
    <div class="actions"><button data-action="copy">Copy</button><button class="primary" data-action="download">Download</button></div>
  </div>`;
}
