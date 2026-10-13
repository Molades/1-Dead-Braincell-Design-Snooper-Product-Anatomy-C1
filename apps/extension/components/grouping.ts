/**
 * Snap a hovered element to the component a designer most likely means: the innermost
 * ancestor with a semantic role or a visible boundary (its own background, border, shadow).
 * Holding Option/Alt bypasses this and picks the exact element.
 */

const SEMANTIC_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label', 'img', 'svg', 'video', 'picture',
  'article', 'li', 'nav', 'header', 'footer', 'aside', 'form', 'fieldset', 'figure', 'dialog', 'table', 'tr',
]);
const SEMANTIC_ROLES = new Set([
  'button', 'link', 'dialog', 'alertdialog', 'listitem', 'article', 'navigation', 'tab', 'tabpanel',
  'menuitem', 'option', 'checkbox', 'radio', 'switch', 'tooltip', 'banner', 'contentinfo', 'search', 'region', 'group',
]);
/** A snap target larger than this share of the viewport is a page wrapper, not a component. */
const MAX_VIEWPORT_SHARE = 0.6;
const MAX_DEPTH = 10;

const transparent = (c: string) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c.replace(/\s+/g, ' '));

export type GroupReason = 'semantic' | 'container';

/** Why this element reads as a component boundary, or null if it does not. */
export function boundaryReason(el: Element): GroupReason | null {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (SEMANTIC_TAGS.has(tag) || (role && SEMANTIC_ROLES.has(role))) return 'semantic';
  const win = el.ownerDocument.defaultView!;
  const cs = win.getComputedStyle(el);
  const parent = el.parentElement ? win.getComputedStyle(el.parentElement) : null;
  const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some(
    (s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 && cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none',
  );
  const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
  const ownBackground = !transparent(cs.backgroundColor) && (!parent || cs.backgroundColor !== parent.backgroundColor);
  const hasImage = !!cs.backgroundImage && cs.backgroundImage !== 'none';
  if (hasBorder || hasShadow || ownBackground || hasImage) return 'container';
  return null;
}

function tooLarge(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false; // no layout info (tests); do not reject
  const win = el.ownerDocument.defaultView!;
  return (r.width * r.height) / (win.innerWidth * win.innerHeight) > MAX_VIEWPORT_SHARE;
}

/** The component to select for a hovered element. Falls back to the element itself. */
export function snapToComponent(target: Element, stopAt?: Element): { el: Element; reason: GroupReason | null } {
  const root = target.ownerDocument.body;
  let node: Element | null = target;
  for (let depth = 0; node && node !== root && node !== stopAt && depth < MAX_DEPTH; depth++, node = node.parentElement) {
    if (tooLarge(node)) break;
    const reason = boundaryReason(node);
    if (reason) return { el: node, reason };
  }
  return { el: target, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Levels: Bigger / Smaller and the selection breadcrumb.

const LABELS: Record<string, string> = {
  a: 'Link', button: 'Button', nav: 'Nav', header: 'Header', footer: 'Footer', aside: 'Sidebar', main: 'Main',
  section: 'Section', article: 'Article', form: 'Form', input: 'Input', select: 'Select', textarea: 'Text area',
  label: 'Label', img: 'Image', picture: 'Image', svg: 'Icon', video: 'Video', ul: 'List', ol: 'List', li: 'Item',
  table: 'Table', tr: 'Row', td: 'Cell', h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading',
  h6: 'Heading', p: 'Text', span: 'Text', figure: 'Figure', dialog: 'Dialog', fieldset: 'Group',
};

/** A one-word name for breadcrumbs and hover labels: “Card”, “Button”, “Section”. */
export function elementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role');
  if (role && SEMANTIC_ROLES.has(role)) return role.charAt(0).toUpperCase() + role.slice(1);
  if (LABELS[tag] && tag !== 'section' && tag !== 'article' && tag !== 'li') return LABELS[tag]!;
  if (boundaryReason(el) === 'container' && el.children.length > 1) return 'Card';
  if (LABELS[tag]) return LABELS[tag]!;
  // Layout wrappers read by what they do with their children.
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  if (el.children.length > 1 && cs.display.includes('grid')) return 'Grid';
  if (el.children.length > 1 && cs.display.includes('flex')) return cs.flexDirection.startsWith('column') ? 'Stack' : 'Row';
  return 'Box';
}

const isRoot = (el: Element | null) => !el || el === el.ownerDocument.body || el === el.ownerDocument.documentElement;

/** One level out; null at the page body. */
export function levelUp(el: Element): Element | null {
  const parent = el.parentElement;
  return isRoot(parent) ? null : parent;
}

/** One level in, toward `toward` (what the pointer was on) when it is inside; else the first visible child. */
export function levelDown(el: Element, toward?: Element | null): Element | null {
  if (toward && toward !== el && el.contains(toward)) {
    let n: Element = toward;
    while (n.parentElement && n.parentElement !== el) n = n.parentElement;
    return n;
  }
  return [...el.children].find((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? el.firstElementChild;
}

/** Up to `max` ancestors (outermost first), then the element itself. */
export function ancestry(el: Element, max = 3): Element[] {
  const out: Element[] = [el];
  for (let n = levelUp(el); n && out.length <= max; n = levelUp(n)) out.unshift(n);
  return out;
}
