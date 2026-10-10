import { describe, expect, it } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { RuleResult, type Facts } from '@pixelpeeper/schema';
import { evaluate, judgmentQueue, measuredResults, RULES } from './index';

/** Render markup, measure #t, and override the box size (jsdom has no layout). */
function factsFor(html: string, size?: { width: number; height: number }): Facts {
  document.body.innerHTML = html;
  const f = measureElement(document.getElementById('t')!);
  const s = size ?? { width: 120, height: 48 };
  f.size.width.value = s.width;
  f.size.height.value = s.height;
  f.a11y.tapTarget.value = s;
  return f;
}
const byId = (results: RuleResult[], id: string) => results.find((r) => r.ruleId === id)!;

describe('rules library', () => {
  it('has unique ids and complete metadata', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) {
      expect(r.criterion).toBeTruthy();
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.scopes.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluate', () => {
  it('returns schema-valid results and is deterministic', () => {
    const f = factsFor('<button id="t" style="color:#000;background:#fff;font-size:16px;line-height:24px">Buy</button>');
    const a = evaluate(f), b = evaluate(f);
    a.forEach((r) => expect(() => RuleResult.parse(r)).not.toThrow());
    expect(a).toEqual(b);
  });

  it('labels threshold results measured and judgment results inferred', () => {
    const results = evaluate(factsFor('<button id="t" style="color:#000;background:#fff">Buy</button>'));
    for (const r of results) {
      if (r.ruleId.startsWith('law-') || r.ruleId.startsWith('principle-')) expect(r.label).toBe('inferred');
      if (r.ruleId.startsWith('wcag-')) expect(r.label).toBe('measured');
    }
    expect(judgmentQueue(results).every((r) => r.label === 'inferred')).toBe(true);
    expect(measuredResults(results).every((r) => r.status !== 'not-applicable')).toBe(true);
  });

  it('keeps Nielsen heuristics out of element scope', () => {
    expect(evaluate(factsFor('<p id="t">Hi</p>')).some((r) => r.ruleId.startsWith('nielsen-'))).toBe(false);
    expect(evaluate(factsFor('<p id="t">Hi</p>'), { scope: 'page' }).filter((r) => r.ruleId.startsWith('nielsen-'))).toHaveLength(10);
  });
});

describe('contrast', () => {
  it('passes black on white', () => {
    const r = byId(evaluate(factsFor('<p id="t" style="color:#000;background:#fff">Hi</p>')), 'wcag-1.4.3-contrast-minimum');
    expect(r.status).toBe('pass');
    expect(r.threshold).toBe(4.5);
  });
  it('fails light grey normal text but passes the same grey as large text', () => {
    const small = byId(evaluate(factsFor('<p id="t" style="color:#999;background:#fff;font-size:16px">Hi</p>')), 'wcag-1.4.3-contrast-minimum');
    const large = byId(evaluate(factsFor('<p id="t" style="color:#888;background:#fff;font-size:32px">Hi</p>')), 'wcag-1.4.3-contrast-minimum');
    expect(small.status).toBe('fail');
    expect(large.status).toBe('pass');
    expect(large.threshold).toBe(3);
  });
  it('reports cannot-measure over a gradient, never a guess', () => {
    const r = byId(evaluate(factsFor('<div style="background-image:linear-gradient(red,blue)"><p id="t" style="color:#fff">Hi</p></div>')), 'wcag-1.4.3-contrast-minimum');
    expect(r.status).toBe('cannot-measure');
    expect(r.actual).toBeUndefined();
  });
  it('is not applicable without text', () => {
    expect(byId(evaluate(factsFor('<div id="t"></div>')), 'wcag-1.4.3-contrast-minimum').status).toBe('not-applicable');
  });
});

describe('target size', () => {
  it('uses 24px for AA and 44px for AAA, not a universal 44px', () => {
    const results = evaluate(factsFor('<button id="t">Go</button>', { width: 32, height: 32 }));
    expect(byId(results, 'wcag-2.5.8-target-size-minimum').status).toBe('pass');
    expect(byId(results, 'wcag-2.5.5-target-size-enhanced').status).toBe('fail');
  });
  it('lists unevaluated exceptions on failure', () => {
    const r = byId(evaluate(factsFor('<button id="t">x</button>', { width: 16, height: 16 })), 'wcag-2.5.8-target-size-minimum');
    expect(r.status).toBe('fail');
    expect(r.unevaluatedExceptions!.some((e) => e.startsWith('Spacing'))).toBe(true);
  });
  it('skips non-interactive elements and inline links', () => {
    expect(byId(evaluate(factsFor('<p id="t">Hi</p>')), 'wcag-2.5.8-target-size-minimum').status).toBe('not-applicable');
    expect(byId(evaluate(factsFor('<p>Read <a id="t" href="#" style="display:inline">more</a></p>', { width: 30, height: 18 })), 'wcag-2.5.8-target-size-minimum').status).toBe('not-applicable');
  });
});

describe('structure rules', () => {
  it('fails an image with no alt and passes decorative empty alt', () => {
    expect(byId(evaluate(factsFor('<img id="t" src="x.png">')), 'wcag-1.1.1-image-alt').status).toBe('fail');
    expect(byId(evaluate(factsFor('<img id="t" src="x.png" alt="">')), 'wcag-1.1.1-image-alt').status).toBe('pass');
  });
  it('fails an icon-only button with no name', () => {
    expect(byId(evaluate(factsFor('<button id="t"><svg></svg></button>')), 'wcag-4.1.2-accessible-name').status).toBe('fail');
    expect(byId(evaluate(factsFor('<button id="t" aria-label="Close"><svg></svg></button>')), 'wcag-4.1.2-accessible-name').status).toBe('pass');
  });
});

describe('guidelines and observations', () => {
  it('labels text size as a guideline, not WCAG', () => {
    const r = byId(evaluate(factsFor('<p id="t" style="font-size:11px">tiny</p>')), 'guideline-min-text-size');
    expect(r.status).toBe('fail');
    expect(r.conformance).toBe('guideline');
  });
  it('checks line height ratio and handles "normal"', () => {
    expect(byId(evaluate(factsFor('<p id="t" style="font-size:16px;line-height:20px">Hi</p>')), 'guideline-line-height').status).toBe('fail');
    expect(byId(evaluate(factsFor('<p id="t" style="font-size:16px">Hi</p>')), 'guideline-line-height').status).toBe('cannot-measure');
  });
  it('observes the spacing grid without pass/fail', () => {
    const r = byId(evaluate(factsFor('<div id="t" style="padding:8px 16px">x</div>')), 'observe-spacing-grid');
    expect(r.status).toBe('observed');
    expect(r.actual).toBe(8);
  });
});
