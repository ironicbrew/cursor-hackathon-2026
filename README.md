# NetWorth AI

> Your network is your net worth. AI-powered introductions that actually matter.

## The Problem

Finding jobs is hard. Cold outreach fails 95% of the time. But warm introductions? They convert at 10x the rate. The problem is, most people don't know who in their network could help them — or how to ask.

## The Solution

NetWorth AI is an intelligent networking broker that:

1. **Understands what you're working on** — Through a conversational onboarding, the AI learns your current focus, goals, and what you're looking for
2. **Analyzes your professional profile** — Connects via LinkedIn to understand your background and expertise
3. **Finds meaningful local connections** — Uses semantic matching to identify people in your area who can genuinely help
4. **Brokers the introduction** — Provides personalized rationales explaining *why* you should connect, plus conversation starters so you never have an awkward first message

## Innovation Highlights

- **Semantic Matching with pgvector** — User profiles and intents are embedded using OpenAI's text-embedding-3-small and stored in PostgreSQL with pgvector for fast similarity search
- **AI-Generated Rationales** — Every match comes with a personalized explanation of why you should connect, common ground, and suggested openers
- **Background Job Orchestration** — Inngest handles durable background jobs for embedding generation and matching runs
- **Real-time Notifications** — Supabase Realtime instantly notifies users when new matches are found

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  React + Vite   │────▶│  Vercel Edge    │────▶│    Inngest      │
│  (Tailwind/MD3) │     │  /api/inngest   │     │  Background Jobs│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │                                               │
        ▼                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    Auth     │  │  Postgres   │  │  Realtime   │              │
│  │  (LinkedIn) │  │  + pgvector │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌─────────────┐
                    │   OpenAI    │
                    │ Embeddings  │
                    │   + GPT-4o  │
                    └─────────────┘
```

## Tech Stack

- **Frontend**: React 18, TypeScript (strict), Vite, Tailwind CSS, shadcn/ui (Radix)
- **Backend**: Supabase (Postgres, Auth, Realtime), Inngest (background jobs)
- **AI**: OpenAI text-embedding-3-small (embeddings), GPT-4o-mini (rationale generation)
- **Database**: PostgreSQL with pgvector extension for vector similarity search
- **Deployment**: Vercel (SPA + serverless functions)

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with pgvector enabled)
- OpenAI API key
- Inngest account (optional for local dev)

### Setup

1. Clone and install dependencies:

```bash
git clone <repo-url>
cd cursor-hackathon-2026
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Edit `.env` with your Supabase and OpenAI keys (see comments in `.env.example`).

4. Run the Supabase schema:

```bash
# In Supabase SQL Editor, run:
# supabase/schema.sql
```

5. (Optional) Seed demo data:

```bash
npx tsx scripts/seed-demo.ts
```

6. Start development:

```bash
npm run dev:all
```

### Demo Mode

For judging purposes, set `VITE_DEMO_MODE=true` to bypass LinkedIn OAuth. The app will use seeded demo users to demonstrate the full matching flow.

## Project Structure

```
├── api/
│   └── inngest.ts          # Vercel serverless function for Inngest
├── scripts/
│   └── seed-demo.ts        # Demo data seeder
├── src/
│   ├── components/ui/      # shadcn/ui components (MD3 themed)
│   ├── hooks/              # React hooks (useAuth, useMatchSuggestions)
│   ├── lib/                # Utilities (supabase client, inngest)
│   ├── pages/              # Route components
│   ├── types/              # TypeScript types & Zod schemas
│   └── App.tsx             # Router setup
├── supabase/
│   └── schema.sql          # Database schema with pgvector
└── vercel.json             # Vercel config with SPA rewrites
```

## Key Features

### 1. Conversational Onboarding
Chat-based interface asks "What's on your mind?" to capture user intent beyond just their LinkedIn profile.

### 2. Semantic Matching
User embeddings are compared using cosine similarity in pgvector. Matches above 0.7 similarity threshold are surfaced.

### 3. AI Rationales
Every match includes:
- Why you should connect
- Common ground
- Conversation starters
- Networking tips

### 4. Accept/Decline Flow
- **Accept**: See detailed coaching and suggested openers
- **Decline**: Provide feedback to improve future matches (training telemetry)

## Deployment

### Vercel

1. Connect your GitHub repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy — builds automatically on push to main

### Supabase

1. Create a new project in a Canadian region
2. Enable the `vector` extension in SQL Editor
3. Run `supabase/schema.sql`
4. Configure LinkedIn OAuth in Auth settings

## License

MIT
