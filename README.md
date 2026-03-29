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

## License

Proprietary
