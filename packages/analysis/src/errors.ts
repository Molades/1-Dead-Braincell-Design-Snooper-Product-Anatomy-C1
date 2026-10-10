export type AnalysisErrorCode = 'invalid-key' | 'rate-limited' | 'refused' | 'truncated' | 'unparseable' | 'network' | 'api';

export class AnalysisError extends Error {
  constructor(public code: AnalysisErrorCode, message: string) { super(message); }
}
