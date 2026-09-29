const TAG_COMPONENTS: Record<string, string> = {
  nav: 'navigation', header: 'header', footer: 'footer', button: 'button', a: 'link',
  input: 'input', select: 'select', textarea: 'textarea', form: 'form', table: 'table',
  dialog: 'dialog', img: 'image', h1: 'heading', h2: 'heading', h3: 'heading',
  h4: 'heading', h5: 'heading', h6: 'heading', ul: 'list', ol: 'list', main: 'main',
};
const ROLE_COMPONENTS: Record<string, string> = {
  navigation: 'navigation', button: 'button', tooltip: 'tooltip', dialog: 'dialog', alert: 'alert',
  tab: 'tab', tablist: 'tabs', menu: 'menu', banner: 'header', contentinfo: 'footer', search: 'search',
};

/** Component type only when the markup makes it clear; otherwise null (left to the AI as Inferred). */
export function componentType(el: Element): string | null {
  const role = el.getAttribute('role');
  if (role && ROLE_COMPONENTS[role]) return ROLE_COMPONENTS[role]!;
  return TAG_COMPONENTS[el.tagName.toLowerCase()] ?? null;
}

export function accessibleName(el: Element): string | null {
  const label = el.getAttribute('aria-label');
  if (label) return label;
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const text = by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
    if (text) return text;
  }
  const text = el.textContent?.trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 120) : null;
}

export function depthOf(el: Element): number {
  let d = 0;
  for (let n = el.parentElement; n; n = n.parentElement) d++;
  return d;
}
