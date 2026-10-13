import { describe, expect, it } from 'vitest';
import { welcomeView, type WelcomeState } from './welcome-view';

const base: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', provider: 'groq', hasKey: {}, keyStatus: { kind: 'idle' }, shortcut: '⌥P' };

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
  it('lets people skip the key, says what is sent, and shows test results', () => {
    const html = welcomeView({ ...base, step: 2, keyStatus: { kind: 'error', message: 'Groq rejected this key.' } });
    expect(html).toContain('Measure only for now');
    expect(html).toContain('Nothing is sent while you hover or pick');
    expect(html).toContain('Groq rejected this key.');
    expect(welcomeView({ ...base, step: 2, hasKey: { groq: true } })).toContain('>Next<');
  });
  it('ends with how to start, including the shortcut', () => {
    const html = welcomeView({ ...base, step: 3 });
    expect(html).toContain('<kbd>⌥P</kbd>');
    expect(html).toContain('Open Library');
    expect(html).not.toContain('Skip setup');
  });
});
