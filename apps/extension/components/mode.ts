/**
 * Where AI lessons come from.
 * - 'byok' (default): the user adds their own Groq or Anthropic key; requests go straight to that provider.
 * - 'hosted': Pixel Peeper's own API (apps/api) holds the key and gives each install a daily allowance.
 * Switch with WXT_LESSONS_MODE=hosted (and WXT_API_URL) in apps/extension/.env.production.
 */
export type LessonsMode = 'byok' | 'hosted';
export const LESSONS_MODE: LessonsMode = import.meta.env?.WXT_LESSONS_MODE === 'hosted' ? 'hosted' : 'byok';
