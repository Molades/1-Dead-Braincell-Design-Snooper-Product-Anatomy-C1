import type { Facts } from '@pixelpeeper/schema';
import { hasText, isHidden, isInteractive, isLargeText } from './predicates';
import type { CheckOutcome, ThresholdRule } from './types';

const WCAG = 'https://www.w3.org/TR/WCAG22/';
const na = (message: string): CheckOutcome => ({ status: 'not-applicable', message });
const fmt = (n: number) => +n.toFixed(2);

function contrastRule(level: 'aa' | 'aaa'): ThresholdRule {
  const aa = level === 'aa';
  return {
    id: aa ? 'wcag-1.4.3-contrast-minimum' : 'wcag-1.4.6-contrast-enhanced',
    version: '1.0.0',
    kind: 'threshold',
    name: aa ? 'Text contrast (AA)' : 'Text contrast (AAA)',
    conformance: aa ? 'wcag-aa' : 'wcag-aaa',
    criterion: aa ? 'WCAG 2.2 SC 1.4.3 Contrast (Minimum)' : 'WCAG 2.2 SC 1.4.6 Contrast (Enhanced)',
    source: { title: 'WCAG 2.2', url: `${WCAG}#contrast-${aa ? 'minimum' : 'enhanced'}` },
    scopes: ['element'],
    evidence: ['color.contrast', 'typography.fontSize', 'typography.fontWeight'],
    check(f) {
      if (!hasText(f)) return na('No text in this element.');
      if (isHidden(f)) return na('Element is not rendered.');
      const c = f.color.contrast;
      if (!c.canMeasure || c.ratio === null) {
        return { status: 'cannot-measure', message: `Contrast can't be measured reliably: ${c.reason ?? 'colors unresolved'}.` };
      }
      const large = isLargeText(f);
      const threshold = aa ? (large ? 3 : 4.5) : large ? 4.5 : 7;
      const pass = c.ratio >= threshold;
      return {
        status: pass ? 'pass' : 'fail',
        actual: c.ratio,
        threshold,
        message: `${c.ratio}:1 ${pass ? 'meets' : 'is below'} the ${threshold}:1 minimum for ${large ? 'large' : 'normal'} text.`,
        unevaluatedExceptions: ['Incidental text (inactive UI, decoration)', 'Logotypes'],
      };
    },
  };
}

function targetRule(level: 'aa' | 'aaa'): ThresholdRule {
  const aa = level === 'aa';
  const min = aa ? 24 : 44;
  return {
    id: aa ? 'wcag-2.5.8-target-size-minimum' : 'wcag-2.5.5-target-size-enhanced',
    version: '1.0.0',
    kind: 'threshold',
    name: aa ? 'Target size (AA, 24px)' : 'Target size (AAA, 44px)',
    conformance: aa ? 'wcag-aa' : 'wcag-aaa',
    criterion: aa ? 'WCAG 2.2 SC 2.5.8 Target Size (Minimum)' : 'WCAG 2.2 SC 2.5.5 Target Size (Enhanced)',
    source: { title: 'WCAG 2.2', url: `${WCAG}#target-size-${aa ? 'minimum' : 'enhanced'}` },
    scopes: ['element'],
    evidence: ['a11y.tapTarget', 'structure.tag', 'structure.role', 'layout.display'],
    check(f) {
      if (!isInteractive(f)) return na('Not an interactive element.');
      if (isHidden(f)) return na('Element is not rendered.');
      if (f.structure.tag.value === 'a' && f.layout.display.value === 'inline') {
        return na('Inline link inside text; the Inline exception likely applies.');
      }
      const { width, height } = f.a11y.tapTarget.value;
      const smallest = Math.min(width, height);
      const pass = smallest >= min;
      return {
        status: pass ? 'pass' : 'fail',
        actual: `${fmt(width)}×${fmt(height)}`,
        threshold: `${min}×${min}`,
        message: pass
          ? `${fmt(width)}×${fmt(height)} CSS px meets the ${min}×${min} target size.`
          : `${fmt(width)}×${fmt(height)} CSS px is below ${min}×${min}.${aa ? ' It may still conform via the spacing or equivalent-control exceptions, which were not checked.' : ''}`,
        unevaluatedExceptions: aa
          ? ['Spacing (24px circle does not overlap other targets)', 'Equivalent control elsewhere', 'User-agent control', 'Essential presentation']
          : ['Equivalent control elsewhere', 'User-agent control', 'Essential presentation'],
      };
    },
  };
}

export const THRESHOLD_RULES: ThresholdRule[] = [
  contrastRule('aa'),
  contrastRule('aaa'),
  targetRule('aa'),
  targetRule('aaa'),
  {
    id: 'wcag-1.1.1-image-alt',
    version: '1.0.0',
    kind: 'threshold',
    name: 'Image has alt attribute',
    conformance: 'wcag-a',
    criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content',
    source: { title: 'WCAG 2.2', url: `${WCAG}#non-text-content` },
    scopes: ['element'],
    evidence: ['a11y.altText', 'structure.tag'],
    check(f) {
      if (f.structure.tag.value !== 'img') return na('Not an image element.');
      const alt = f.a11y.altText.value;
      if (alt === null) return { status: 'fail', message: 'Image has no alt attribute.' };
      return {
        status: 'pass',
        message: alt === '' ? 'Empty alt: marked as decorative. Whether it is truly decorative needs judgment.' : `Alt text present: “${alt.slice(0, 80)}”.`,
        unevaluatedExceptions: ['Whether the alt text is an accurate equivalent'],
      };
    },
  },
  {
    id: 'wcag-4.1.2-accessible-name',
    version: '1.0.0',
    kind: 'threshold',
    name: 'Interactive element has a name',
    conformance: 'wcag-a',
    criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value',
    source: { title: 'WCAG 2.2', url: `${WCAG}#name-role-value` },
    scopes: ['element'],
    evidence: ['a11y.accessibleName', 'structure.tag', 'structure.role'],
    check(f) {
      if (!isInteractive(f)) return na('Not an interactive element.');
      const name = f.a11y.accessibleName.value;
      return name
        ? { status: 'pass', message: `Accessible name: “${name.slice(0, 80)}”.`, unevaluatedExceptions: ['Names from <label for> and title are not yet read'] }
        : { status: 'fail', message: 'No accessible name found from aria-label, aria-labelledby or text content.', unevaluatedExceptions: ['Names from <label for> and title are not yet read'] };
    },
  },
  {
    id: 'guideline-min-text-size',
    version: '1.0.0',
    kind: 'threshold',
    name: 'Minimum text size (guideline)',
    conformance: 'guideline',
    criterion: 'Pixel Peeper readability guideline: text at least 12px. Not a WCAG requirement.',
    source: { title: 'Pixel Peeper guideline' },
    scopes: ['element'],
    evidence: ['a11y.minTextSize'],
    check(f) {
      const size = f.a11y.minTextSize.value;
      if (size === null) return na('No text in this element.');
      return {
        status: size >= 12 ? 'pass' : 'fail',
        actual: size,
        threshold: 12,
        message: `${size}px text ${size >= 12 ? 'meets' : 'is below'} the 12px readability guideline.`,
      };
    },
  },
  {
    id: 'guideline-line-height',
    version: '1.0.0',
    kind: 'threshold',
    name: 'Body line height (guideline)',
    conformance: 'guideline',
    criterion: 'Pixel Peeper readability guideline: line height at least 1.4× for text under 24px. Not a WCAG requirement.',
    source: { title: 'Pixel Peeper guideline' },
    scopes: ['element'],
    evidence: ['typography.lineHeight', 'typography.fontSize'],
    check(f) {
      if (!hasText(f)) return na('No text in this element.');
      const size = f.typography.fontSize.value;
      if (size >= 24) return na('Display-size text; tighter leading is normal.');
      const lh = f.typography.lineHeight.value;
      if (lh === null) return { status: 'cannot-measure', message: 'Line height is "normal"; the actual value depends on the font.' };
      const ratio = fmt(lh / size);
      return {
        status: ratio >= 1.4 ? 'pass' : 'fail',
        actual: ratio,
        threshold: 1.4,
        message: `Line height ${lh}px is ${ratio}× the ${size}px font size.`,
      };
    },
  },
  {
    id: 'observe-spacing-grid',
    version: '1.0.0',
    kind: 'threshold',
    name: 'Spacing grid',
    conformance: 'guideline',
    criterion: 'Observation: whether padding, margin and gap share a 4px or 8px base. Intent is not implied.',
    source: { title: 'Pixel Peeper observation' },
    scopes: ['element'],
    evidence: ['spacing.scaleBase', 'spacing.padding', 'spacing.margin', 'spacing.gap'],
    check(f: Facts) {
      const all = [...f.spacing.padding.value, ...f.spacing.margin.value, f.spacing.gap.value ?? 0];
      if (all.every((v) => v === 0)) return na('No padding, margin or gap.');
      const base = f.spacing.scaleBase.value;
      return {
        status: 'observed',
        actual: base ?? 'off-grid',
        message: base ? `All spacing values are multiples of ${base}px.` : 'Spacing values do not share a 4px or 8px base.',
      };
    },
  },
];
