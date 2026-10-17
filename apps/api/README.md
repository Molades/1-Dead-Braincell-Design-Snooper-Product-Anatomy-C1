# Pixel Peeper API

Hosted lessons for the extension. The Groq key lives only here; each install gets an anonymous
token and a daily allowance. Screenshots are passed to the model and never stored.

| Route | What it does |
|---|---|
| `POST /v1/install` | Registers an install, returns `{ token, quota }`. Limited per network per day. |
| `GET /v1/quota` | Today's allowance for the install. |
| `POST /v1/lesson` | One lesson (screenshot + measured facts). Counts 1. |
| `POST /v1/compare` | Read-across or rationale for 2–3 ideas (text only). Counts 1. |

Lessons are counted only when they succeed. Our own key or provider problems are shown to users
as "unavailable right now", never as a key error.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GROQ_API_KEY` | yes | | Paid-tier key. Never commit it. |
| `TOKEN_SECRET` | yes | | Long random string; signs install tokens. Changing it signs everyone out (they re-register automatically). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | in production | | Added by Vercel's Upstash Redis integration. `UPSTASH_REDIS_REST_URL` / `_TOKEN` also work. |
| `GROQ_MODEL` | no | `qwen/qwen3.8-27b` | Must accept images. |
| `DAILY_LESSON_LIMIT` | no | `10` | Per install per UTC day. |
| `GLOBAL_DAILY_LIMIT` | no | `2000` | Across all installs; a spend backstop. |
| `INSTALLS_PER_IP_PER_DAY` | no | `5` | New tokens per network per day. |
| `SERVICE_PAUSED` | no | | `1` pauses lessons instantly (kill switch). |

## Deploy on Vercel

1. In Vercel, **Add New → Project**, import this GitHub repo.
2. Set **Root Directory** to `apps/api`. Keep "Include files outside the root directory" on (the API uses the shared `packages/`).
3. **Storage → Marketplace → Upstash Redis**, connect it to the project (adds the `KV_REST_API_*` variables).
4. **Settings → Environment Variables**: add `GROQ_API_KEY` and `TOKEN_SECRET` (generate with `openssl rand -base64 48`).
5. Deploy. Check: `curl -X POST https://<your-project>.vercel.app/v1/install` returns a token.
6. Build the extension against it: put `WXT_API_URL=https://<your-project>.vercel.app` in `apps/extension/.env.production`, then `npm run build:ext`.

Also set a spending limit or alert in the Groq console. `GLOBAL_DAILY_LIMIT` caps lessons, not dollars.

## Local development

```bash
GROQ_API_KEY=gsk_... npm run dev -w @pixelpeeper/api
```

Runs on `http://localhost:8787` with in-memory counts. `npm run dev:ext` builds the extension against it by default.
