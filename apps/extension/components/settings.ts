import { DEFAULT_MODELS, type Provider } from '@pixelpeeper/analysis';

export type { Provider };
export interface Settings {
  provider: Provider;
  keys: Partial<Record<Provider, string>>;
  models: Partial<Record<Provider, string>>;
}

export const SETTINGS_KEY = 'pixelpeeper.settings';
/** Key from the first release, when only Anthropic was supported. */
const LEGACY_ANTHROPIC_KEY = 'pixelpeeper.apiKey';

export const PROVIDERS: Record<Provider, { label: string; keyPrefix: string; host: string; console: string }> = {
  groq: { label: 'Groq', keyPrefix: 'gsk_', host: 'api.groq.com', console: 'console.groq.com' },
  anthropic: { label: 'Anthropic', keyPrefix: 'sk-ant-', host: 'api.anthropic.com', console: 'console.anthropic.com' },
};

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get([SETTINGS_KEY, LEGACY_ANTHROPIC_KEY]);
  const stored = (data[SETTINGS_KEY] ?? {}) as Partial<Settings>;
  const keys = { ...stored.keys };
  if (!keys.anthropic && typeof data[LEGACY_ANTHROPIC_KEY] === 'string') keys.anthropic = data[LEGACY_ANTHROPIC_KEY];
  return { provider: stored.provider ?? 'groq', keys, models: { ...stored.models } };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await chrome.storage.local.remove(LEGACY_ANTHROPIC_KEY);
}

export const activeKey = (s: Settings) => s.keys[s.provider] || null;
export const activeModel = (s: Settings) => s.models[s.provider] || DEFAULT_MODELS[s.provider];
