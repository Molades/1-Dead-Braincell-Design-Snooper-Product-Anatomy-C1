import type { Facts } from '@pixelpeeper/schema';

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'searchbox',
]);

export function isInteractive(f: Facts): boolean {
  const role = f.structure.role.value;
  return INTERACTIVE_TAGS.has(f.structure.tag.value) || (!!role && INTERACTIVE_ROLES.has(role));
}

export const hasText = (f: Facts) => f.a11y.minTextSize.value !== null;

/** WCAG definition of large text: >= 18pt (24px), or >= 14pt (18.66px) bold. */
export function isLargeText(f: Facts): boolean {
  const size = f.typography.fontSize.value;
  return size >= 24 || (size >= 18.66 && f.typography.fontWeight.value >= 700);
}

export const isHidden = (f: Facts) => f.size.width.value === 0 || f.size.height.value === 0;
