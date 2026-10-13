import type { Facts, PageInfo } from '@pixelpeeper/schema';

/** Page info and human titles for captures. Reads only the page's own markup and URL. */

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "www.stripe.com" → "Stripe"; "docs.github.com" → "Github"; "localhost" → "Localhost". */
export function siteNameFromHost(host: string): string {
  const parts = host.replace(/^www\./, '').split('.').filter(Boolean);
  const label = parts.length >= 2 ? parts[parts.length - 2]! : parts[0] ?? host;
  return /^\d+$/.test(label) || host.match(/^\d+\.\d+\.\d+\.\d+$/) ? host : titleCase(label);
}

const SEPARATORS = /\s+[|–—·:•»-]\s+/;

/** The page's own name: document title minus the site name, else the last path segment, else "Home". */
export function pageNameFrom(documentTitle: string, siteName: string, path: string): string {
  const site = siteName.toLowerCase();
  const segments = documentTitle.split(SEPARATORS).map((s) => s.trim()).filter(Boolean);
  const own = segments.filter((s) => !s.toLowerCase().includes(site) && !site.includes(s.toLowerCase()));
  if (own.length) return clip(own[0]!, 40);
  const last = path.split('/').filter(Boolean).pop();
  if (last) return clip(titleCase(decodeURIComponent(last).replace(/\.\w+$/, '')), 40);
  return 'Home';
}

export function pageInfo(doc: Document): PageInfo {
  const loc = doc.defaultView!.location;
  const meta = (sel: string) => doc.querySelector<HTMLMetaElement>(sel)?.content?.trim() || '';
  const siteName = clip(meta('meta[property="og:site_name"]') || meta('meta[name="application-name"]') || siteNameFromHost(loc.hostname), 32);
  const documentTitle = doc.title.trim();
  const icon = doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  return {
    url: loc.href,
    host: loc.hostname,
    path: loc.pathname,
    documentTitle,
    siteName,
    pageName: pageNameFrom(documentTitle, siteName, loc.pathname),
    favicon: icon?.href || null,
  };
}

const TAG_WORDS: Record<string, string> = {
  a: 'Link', button: 'Button', nav: 'Navigation', header: 'Header', footer: 'Footer', aside: 'Sidebar',
  form: 'Form', input: 'Input', select: 'Select', textarea: 'Text area', label: 'Label', img: 'Image',
  picture: 'Image', video: 'Video', svg: 'Icon', ul: 'List', ol: 'List', li: 'List item', table: 'Table',
  h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Paragraph',
  section: 'Section', article: 'Article', figure: 'Figure', dialog: 'Dialog', main: 'Main content', span: 'Text',
};

/**
 * Short name for what was picked. Prefers the lesson's role label; otherwise names the markup.
 * A plain container with its own border, shadow or rounded background reads as a "Card".
 */
export function patternName(facts: Facts, scope: 'element' | 'page', roleLabel?: string | null): string {
  if (roleLabel?.trim()) return clip(roleLabel.trim().replace(/^\w/, (c) => c.toUpperCase()), 40);
  if (scope === 'page') return 'Visible page';
  // Short visible text tells two buttons apart: Button “Choose Growth”.
  const name = facts.a11y.accessibleName.value?.trim();
  const base = markupName(facts);
  return name && name.length <= 28 ? `${base} “${name}”` : base;
}

function markupName(facts: Facts): string {
  const component = facts.structure.componentType.value;
  if (component && component !== 'heading' && component !== 'image' && component !== 'list') return titleCase(component);
  const tag = facts.structure.tag.value;
  const shadow = facts.shape.boxShadow.value;
  const boxed = facts.shape.borderWidth.value > 0 || (!!shadow && shadow !== 'none') ||
    (facts.shape.borderRadius.value.some((r) => r > 0) && facts.color.background.value !== 'rgba(0, 0, 0, 0)');
  if (boxed && facts.structure.childCount.value > 1 && ['div', 'section', 'article', 'li', 'a'].includes(tag)) return 'Card';
  return TAG_WORDS[tag] ?? 'Block';
}

/** "Plan call-to-action — Stripe · Pricing" */
export const captureTitle = (pattern: string, page: Pick<PageInfo, 'siteName' | 'pageName'>) =>
  `${pattern} — ${page.siteName} · ${page.pageName}`;
