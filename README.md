# Credvia

A professional community platform where reputation is earned through contribution, not claimed through profile polish.

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Supabase
- **Database:** PostgreSQL (Supabase)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage
- **Cache:** Upstash Redis
- **Jobs:** Inngest
- **Email:** Resend
- **Analytics:** PostHog
- **Monitoring:** Sentry

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your credentials
3. Install dependencies: `npm install`
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

## Shared AI Runtime (Groq Default)

Configure the app runtime provider using environment variables (never hardcode API keys):

```bash
AI_PROVIDER=groq
AI_GROQ_API_KEY=<founder-review-groq-api-key>
GROQ_BASE_URL=https://api.groq.com/openai/v1
AI_GROQ_MODEL=llama-3.3-70b-versatile
AI_PROVIDER_TIMEOUT_MS=30000
AI_PROVIDER_MAX_RETRIES=2
AI_WORKER_SECRET=<worker-shared-secret>
AI_WORKER_BATCH_SIZE=1
AI_WORKER_PARALLELISM=1
AI_WORKER_POLL_INTERVAL_MS=10000
AI_WORKER_POLL_JITTER_MS=2000
```

App AI runtime key selection is strict: founder feedback uses `AI_GROQ_API_KEY` only. Legacy Groq key aliases are ignored by app runtime.
Resume extractor key selection is isolated: extractor runtime uses `RESUME_EXTRACTOR_GROQ_API_KEY`.

Worker runbook:

```bash
# 1) Start app server
npm run dev

# 2) In another terminal, start worker loop
npm run ai:worker
```

Production deployment (no cron):

1. keep frontend and API routes on Vercel
2. run the AI worker as an always-on service on Render (Background Worker)
3. keep queue state in Supabase (`ai_runs`, review tables, claim flow)

Exact Render start command:

```bash
npm run ai:worker
```

Optional web-service wrapper mode (for platforms that require an open health port):

```bash
npm run ai:worker:web
```

Required worker environment variables:

```bash
AI_PROVIDER=groq
AI_GROQ_API_KEY=<your-groq-key>
AI_GROQ_MODEL=llama-3.3-70b-versatile
AI_WORKER_SECRET=<shared-worker-secret>
CREDVIA_APP_URL=https://<your-vercel-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Startup logs include these non-secret fields:

1. `provider`
2. `model`
3. `appUrl`
4. `workerSecretConfigured`

Production verification checklist:

1. Deploy worker service on Render with start command `npm run ai:worker`.
2. Deploy app on Vercel and confirm `CREDVIA_APP_URL` points to that domain.
3. Trigger one founder review from the product UI (`Get AI Feedback`).
4. Verify worker logs show loop cycles and successful `/api/v1/ai/worker` calls.
5. Verify Supabase run state transitions: `queued -> running -> succeeded`.
6. Confirm founder feedback UI renders completed review output.

Cron note:

1. Do not use Vercel cron for the continuous worker loop.
2. `vercel.json` cron config has been removed for worker processing.

Manual worker trigger in any environment:

```bash
curl -X POST "$APP_URL/api/v1/ai/worker" \
	-H "content-type: application/json" \
	-H "x-ai-worker-secret: $AI_WORKER_SECRET" \
	-d '{}'
```

Expected worker startup log fields are non-secret and include:

1. active provider
2. workerSecretConfigured
3. batchSize
4. leaseSeconds
5. pollIntervalMs

Worker throttling defaults are intentionally conservative to avoid 429 amplification:

1. poll cadence clamped to 8-12 seconds
2. jitter clamped to +/-2 seconds
3. batch size clamped to 1-2 runs per cycle
4. parallelism clamped to max 2 and never above batch size

When no AI runs are queued, the worker remains healthy and logs periodic idle cycles without failing.

## Database Setup

Run Supabase migrations:
```bash
npx supabase db push
```

## Resume Intelligence Runtime

The production app expects `RESUME_EXTRACTOR_URL` to point at the remote FastAPI extractor. For Credvia production this should be:

```bash
RESUME_EXTRACTOR_URL=https://resume-extractor-5cgd.onrender.com
RESUME_EXTRACTOR_TIMEOUT_MS=60000
RESUME_EXTRACTOR_RETRY_COUNT=1
TRUSTED_SOURCE_CIDRS=74.220.48.0/24,74.220.56.0/24
```

Render extractor env should include:

```bash
LLM_ALWAYS_ON=true
LLM_PROVIDER=groq
RESUME_EXTRACTOR_GROQ_API_KEY=...
# Keep GROQ_API_KEY unset to avoid sharing app/runtime keys
OCR_ENABLED=true
LOG_LEVEL=info
MAX_INPUT_SIZE_BYTES=10485760
MAX_LLM_TEXT_CHARS=12000
```

If network restrictions or reverse proxies are enabled, keep `TRUSTED_SOURCE_CIDRS` or `ALLOWED_PROXY_CIDRS` aligned across the app and extractor before trusting forwarded headers.

## License

Proprietary
