const esc = (s: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');

/** Short, stable-ish CSS selector for display and re-finding. */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 6) {
    if (node.id) { parts.unshift(`#${esc(node.id)}`); break; }
    let part = node.tagName.toLowerCase();
    const cls = [...node.classList].slice(0, 2).map((c) => `.${esc(c)}`).join('');
    part += cls;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === node!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}
