import { describe, expect, it } from 'vitest';
import { captureTitle, measureElement, pageInfo, pageNameFrom, patternName, siteNameFromHost } from './index';

describe('site and page names', () => {
  it('derives a site name from the host', () => {
    expect(siteNameFromHost('www.stripe.com')).toBe('Stripe');
    expect(siteNameFromHost('docs.github.com')).toBe('Github');
    expect(siteNameFromHost('my-shop.co')).toBe('My Shop');
    expect(siteNameFromHost('127.0.0.1')).toBe('127.0.0.1');
  });
  it('removes the site name from the document title', () => {
    expect(pageNameFrom('Pricing | Stripe', 'Stripe', '/pricing')).toBe('Pricing');
    expect(pageNameFrom('Stripe — Payments infrastructure', 'Stripe', '/')).toBe('Payments infrastructure');
    expect(pageNameFrom('Linear', 'Linear', '/')).toBe('Home');
    expect(pageNameFrom('', 'Acme', '/blog/design-systems-101')).toBe('Design Systems 101');
  });
  it('reads og:site_name and the page from the document', () => {
    document.head.innerHTML = '<title>Plans and pricing – Northwind</title><meta property="og:site_name" content="Northwind"><link rel="icon" href="/favicon.ico">';
    const p = pageInfo(document);
    expect(p.siteName).toBe('Northwind');
    expect(p.pageName).toBe('Plans and pricing');
    expect(p.favicon).toMatch(/favicon\.ico$/);
  });
});

describe('pattern and title', () => {
  const facts = (html: string) => { document.body.innerHTML = html; return measureElement(document.getElementById('t')!); };
  it('prefers the lesson role label', () => {
    expect(patternName(facts('<button id="t">Go</button>'), 'element', 'plan call-to-action')).toBe('Plan call-to-action');
  });
  it('names markup in words', () => {
    expect(patternName(facts('<button id="t">Go</button>'), 'element')).toBe('Button “Go”');
    expect(patternName(facts('<nav id="t"><a>Home</a><a>Pricing</a><a>Docs</a><a>Changelog</a><a>Careers</a></nav>'), 'element')).toBe('Navigation');
    expect(patternName(facts('<h2 id="t">Title</h2>'), 'element')).toBe('Heading “Title”');
    expect(patternName(facts('<p id="t">A long paragraph of body copy that goes on for a while.</p>'), 'element')).toBe('Paragraph');
  });
  it('calls a bordered container with content a card', () => {
    expect(patternName(facts('<div id="t" style="border:1px solid #ddd"><h3>Growth plan</h3><p>Room to build something bigger.</p></div>'), 'element')).toBe('Card');
    expect(patternName(facts('<section id="t" style="box-shadow:0 1px 2px #0002"><h3>Growth plan</h3><p>Room to build something bigger.</p></section>'), 'element')).toBe('Card');
    expect(patternName(facts('<section id="t"><h3>Growth plan</h3><p>Room to build something bigger.</p></section>'), 'element')).toBe('Section');
    expect(patternName(facts('<div id="t"><span>Some text inside a plain wrapper block</span></div>'), 'element')).toBe('Block');
  });
  it('builds the readable title', () => {
    expect(captureTitle('Plan call-to-action', { siteName: 'Stripe', pageName: 'Pricing' })).toBe('Plan call-to-action — Stripe · Pricing');
  });
});
