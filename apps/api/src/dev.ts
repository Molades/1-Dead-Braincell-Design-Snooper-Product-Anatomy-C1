import { createServer } from 'node:http';
import { counterFromEnv } from './env';
import { createHandler, envFrom } from './handler';

/** Local server: GROQ_API_KEY=... TOKEN_SECRET=dev npm run dev -w @pixelpeeper/api */
const handle = createHandler({ env: envFrom({ TOKEN_SECRET: 'dev-secret', ...process.env }), counter: counterFromEnv(process.env) });
const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method, headers: req.headers as Record<string, string>,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Pixel Peeper API on http://localhost:${port}`));
