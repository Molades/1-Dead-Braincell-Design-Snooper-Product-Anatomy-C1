import { describe, expect, it } from 'vitest';
import { welcomeView, type WelcomeState } from './welcome-view';

const base: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', provider: 'groq', hasKey: {}, keyStatus: { kind: 'idle' }, dailyLimit: 10, shortcut: '⌥P' };

describe('welcome', () => {
  it('explains Measured and Inferred first, with progress', () => {
    const html = welcomeView(base);
    expect(html).toContain('Measured');
    expect(html).toContain('Inferred');
    expect(html).toMatch(/aria-current="step"><span class="sr">Step 1 of 4: <\/span><span class="label">What it does/);
    expect(html).toContain('Skip setup');
  });
  it('keeps the chosen goals and level checked', () => {
    const html = welcomeView({ ...base, step: 1, goals: ['accessibility', 'tokens'], level: 'senior' });
    expect(html).toMatch(/value="accessibility" checked/);
    expect(html).toMatch(/value="tokens" checked/);
    expect(html).not.toMatch(/value="learn" checked/);
    expect(html).toMatch(/value="senior" checked/);
  });
  it('asks for the user’s own key by default, says what is sent, and lets people skip it', () => {
    const html = welcomeView({ ...base, step: 2 });
    expect(html).toContain('Lessons need an AI key');
    expect(html).toContain('type="password"');
    expect(html).toContain('Measure only for now');
    expect(html).toContain('Nothing is sent while you hover or pick');
    expect(welcomeView({ ...base, step: 2, hasKey: { groq: true } })).toContain('<span>Next</span>');
  });
  it('shows a saved key and a failed test differently', () => {
    expect(welcomeView({ ...base, step: 2, keyStatus: { kind: 'ok', message: 'Key works' } })).toMatch(/status ok/);
    expect(welcomeView({ ...base, step: 2, keyStatus: { kind: 'testing' } })).toContain('aria-busy="true"');
  });
  it('gives the sample lesson real values to replace and a detective per step', () => {
    const html = welcomeView(base);
    expect(html).toContain('data-measure="contrast"');
    expect(html).toContain('data-measure="size"');
    for (const step of [1, 2, 3]) expect(welcomeView({ ...base, step })).toMatch(/class="mascot speaker"/);
  });
  it('ends with how to start, including the shortcut', () => {
    const html = welcomeView({ ...base, step: 3 });
    expect(html).toContain('<kbd>⌥P</kbd>');
    expect(html).toContain('Open Library');
    expect(html).not.toContain('Skip setup');
  });
});
