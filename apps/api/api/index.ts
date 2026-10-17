import { counterFromEnv } from '../src/env';
import { createHandler, envFrom } from '../src/handler';

// One function for every route (vercel.json rewrites /v1/* here), so instances are reused.
const handle = createHandler({ env: envFrom(process.env), counter: counterFromEnv(process.env) });

export default { fetch: handle };
