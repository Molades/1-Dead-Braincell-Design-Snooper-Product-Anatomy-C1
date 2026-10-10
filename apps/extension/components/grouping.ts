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
