# Dex Utility Finder

A web app that tracks new Solana tokens from DexScreener, analyzes them with AI (meme vs utility), and helps you organize them into Keep/Delete lists.

**Live:** https://dex-utility.vercel.app

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green)
![Claude AI](https://img.shields.io/badge/Claude-3.5%20Haiku-orange)

## Features

- **Auto-fetches** new Solana tokens every 5 minutes via GitHub Actions
- **Manual fetch** button to pull latest tokens on demand
- **AI Analysis** - Claude classifies tokens as MEME or UTILITY with confidence scores
- **Organize** - Keep or Delete tokens to sort through the noise
- **Search** - Filter by name, ticker, description, or links
- **72-hour window** - Only shows recent tokens to stay relevant

## Screenshots

```
┌─────────────────────────────────────────────────────────┐
│  [New] [Kept] [Deleted]          🔍 Fetch New  Refresh  │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  Token  │  │  Token  │  │  Token  │                  │
│  │  Card   │  │  Card   │  │  Card   │                  │
│  │ Analyze │  │ Analyze │  │ Analyze │                  │
│  │Keep|Del │  │Keep|Del │  │Keep|Del │                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL) |
| AI | Claude 3.5 Haiku |
| Hosting | Vercel |
| Cron | GitHub Actions |

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/MoonBagDexter/DEX-UTILITY.git
cd DEX-UTILITY
npm install
```

### 2. Create Supabase database

Run this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE tokens (
    ca TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    links JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    pair_created_at TIMESTAMP,
    dex_id TEXT,
    status TEXT DEFAULT 'new',
    stats JSONB DEFAULT '{}'
);

CREATE INDEX idx_tokens_status ON tokens(status);
CREATE INDEX idx_tokens_pair_created_at ON tokens(pair_created_at);
CREATE INDEX idx_tokens_created_at ON tokens(created_at);
```

### 3. Set environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=sk-ant-xxxxx
CRON_SECRET=your-secret-key-here
```

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000

### 5. Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### 6. Set up GitHub Actions (for auto-fetch)

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

```
VERCEL_URL=https://your-app.vercel.app
CRON_SECRET=your-secret-key-here
```

The cron job will automatically fetch new tokens every 5 minutes.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cron` | GET | Fetch tokens from DexScreener (requires auth) |
| `/api/refresh` | POST | Fetch tokens (public, 1-min rate limit) |
| `/api/tokens` | GET | Get tokens from database |
| `/api/tokens` | PATCH | Update token status (keep/delete) |
| `/api/analyze` | POST | AI analysis of a token |

## How It Works

```
DexScreener API                    Your App
      │                               │
      │  1. Fetch token profiles      │
      │◄──────────────────────────────│ (every 5 min via cron)
      │                               │
      │  2. Return Solana tokens      │
      │──────────────────────────────►│
      │                               │
      │                               │  3. Save to Supabase
      │                               │─────────────────────►  Database
      │                               │
      │                               │  4. Display in UI
      │                               │◄─────────────────────
```

## Project Structure

```
├── app/
│   ├── page.js                 # Main page
│   ├── layout.js               # Global layout
│   ├── globals.css             # CSS variables & styles
│   └── api/
│       ├── cron/route.js       # Token fetch (cron)
│       ├── refresh/route.js    # Token fetch (manual)
│       ├── tokens/route.js     # Database queries
│       └── analyze/route.js    # AI analysis
│
├── components/
│   ├── TokenFeed.js            # Main feed with tabs & search
│   ├── TokenCard.js            # Individual token card
│   └── *.module.css            # Component styles
│
├── lib/
│   └── supabase.js             # Supabase client
│
├── database/
│   └── schema.sql              # Database schema
│
└── .github/workflows/
    └── cron.yml                # GitHub Actions cron
```

## Configuration

### Change token age filter (default: 72 hours)

`app/api/tokens/route.js`:
```js
const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
//                                               ^^ change this number
```

### Change cron frequency (default: 5 minutes)

`.github/workflows/cron.yml`:
```yaml
schedule:
  - cron: '*/5 * * * *'   # Every 5 min
  # - cron: '*/15 * * * *' # Every 15 min
  # - cron: '0 * * * *'    # Every hour
```

### Change AI model

`app/api/analyze/route.js`:
```js
model: 'claude-3-5-haiku-20241022',    // Cheapest (~$0.80/1M tokens)
// model: 'claude-sonnet-4-20250514',  // Smarter but costs more
```

## License

MIT

## Contributing

PRs welcome! Please open an issue first to discuss what you'd like to change.
