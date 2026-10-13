export type AnalysisErrorCode = 'invalid-key' | 'rate-limited' | 'refused' | 'truncated' | 'unparseable' | 'network' | 'api';

export class AnalysisError extends Error {
  /** Seconds the provider asked us to wait (rate limits). */
  constructor(public code: AnalysisErrorCode, message: string, public retryAfter?: number) { super(message); }
}
