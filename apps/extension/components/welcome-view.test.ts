import { describe, expect, it } from 'vitest';
import { welcomeView, type WelcomeState } from './welcome-view';

const base: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', dailyLimit: 10, shortcut: '⌥P' };

describe('welcome', () => {
  it('explains Measured and Inferred first, with progress', () => {
    const html = welcomeView(base);
    expect(html).toContain('Measured');
    expect(html).toContain('Inferred');
    expect(html).toMatch(/aria-current="step"><span>1<\/span>What it does/);
    expect(html).toContain('Skip setup');
  });
  it('keeps the chosen goals and level checked', () => {
    const html = welcomeView({ ...base, step: 1, goals: ['accessibility', 'tokens'], level: 'senior' });
    expect(html).toMatch(/value="accessibility" checked/);
    expect(html).toMatch(/value="tokens" checked/);
    expect(html).not.toMatch(/value="learn" checked/);
    expect(html).toMatch(/value="senior" checked/);
  });
  it('says lessons are included, with the daily allowance and what is sent, and asks for no key', () => {
    const html = welcomeView({ ...base, step: 2 });
    expect(html).toContain('Lessons are included');
    expect(html).toContain('10 AI lessons a day');
    expect(html).toContain('No account or API key needed');
    expect(html).toContain('Screenshots are not stored');
    expect(html).not.toContain('type="password"');
    expect(welcomeView({ ...base, step: 2, dailyLimit: null })).toContain('daily allowance');
  });
  it('ends with how to start, including the shortcut', () => {
    const html = welcomeView({ ...base, step: 3 });
    expect(html).toContain('<kbd>⌥P</kbd>');
    expect(html).toContain('Open Library');
    expect(html).not.toContain('Skip setup');
  });
});
