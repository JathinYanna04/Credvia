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
GROQ_API_KEY=...
OCR_ENABLED=true
LOG_LEVEL=info
MAX_INPUT_SIZE_BYTES=10485760
MAX_LLM_TEXT_CHARS=12000
```

If network restrictions or reverse proxies are enabled, keep `TRUSTED_SOURCE_CIDRS` or `ALLOWED_PROXY_CIDRS` aligned across the app and extractor before trusting forwarded headers.

## License

Proprietary
