# Dex Utility Finder - Handover Document

## What This App Does
Tracks new Solana tokens from DexScreener, lets you analyze them with AI (meme vs utility), and organize them into Keep/Delete lists. Only shows tokens from the last 72 hours.

---

## Tech Stack
- **Frontend:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL)
- **AI:** Claude 3.5 Haiku (cheapest model)
- **Hosting:** Vercel
- **Cron:** GitHub Actions (every 15 min)

---

## Live URLs
- **App:** https://dex-utility.vercel.app
- **Repo:** https://github.com/MoonBagDexter/DEX-UTILITY

---

## Environment Variables (in Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=sk-ant-xxxxx
CRON_SECRET=my-super-secret-cron-key-12345
```

## GitHub Secrets (for cron)
```
VERCEL_URL=https://dex-utility.vercel.app
CRON_SECRET=my-super-secret-cron-key-12345
```

---

## File Structure

```
├── app/
│   ├── page.js                 # Main page (New tokens)
│   ├── layout.js               # Global layout with Nav
│   ├── globals.css             # Global styles & CSS variables
│   ├── kept/page.js            # Kept tokens page
│   ├── deleted/page.js         # Deleted tokens page
│   └── api/
│       ├── cron/route.js       # Fetches tokens from DexScreener
│       ├── tokens/route.js     # GET tokens, PATCH status
│       └── analyze/route.js    # AI analysis endpoint
│
├── components/
│   ├── Nav.js                  # Top navigation bar
│   ├── TokenFeed.js            # Main feed with tabs, search, grid
│   ├── TokenCard.js            # Individual token card
│   ├── TokenCardSkeleton.js    # Loading skeleton
│   └── *.module.css            # Component styles
│
├── lib/
│   └── supabase.js             # Supabase client
│
├── database/
│   └── schema.sql              # Database table schema
│
└── .github/workflows/
    └── cron.yml                # GitHub Actions cron job
```

---

## How It Works

### Token Collection (Cron)
1. GitHub Actions runs every 15 minutes
2. Calls `/api/cron` with auth header
3. Fetches latest Solana tokens from DexScreener API
4. Saves new tokens to Supabase (skips existing ones)

### Token Display
1. `/api/tokens` fetches from Supabase
2. Filters: only tokens from last 72 hours
3. Shows in grid with search functionality

### AI Analysis
1. Click "Analyze" on any card
2. Calls `/api/analyze` with token data
3. Claude Haiku decides: MEME or UTILITY
4. Returns classification + confidence + reasoning

### Keep/Delete
1. Click Keep or Delete button
2. PATCH request updates status in database
3. Token removed from current view

---

## Database Schema (Supabase)

```sql
CREATE TABLE tokens (
    ca TEXT PRIMARY KEY,           -- Contract address
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    links JSONB DEFAULT '[]',      -- [{type, url}, ...]
    created_at TIMESTAMP DEFAULT NOW(),
    pair_created_at TIMESTAMP,
    dex_id TEXT,
    status TEXT DEFAULT 'new',     -- 'new', 'kept', 'deleted'
    stats JSONB DEFAULT '{}'       -- {marketCap, volume24h, ...}
);
```

---

## Common Changes

### Change the 72-hour filter
File: `app/api/tokens/route.js` (line ~27)
```js
const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
```
Change `72` to whatever hours you want.

### Change cron frequency
File: `.github/workflows/cron.yml`
```yaml
schedule:
  - cron: '*/15 * * * *'  # Every 15 min
  # '*/5 * * * *'         # Every 5 min
  # '0 * * * *'           # Every hour
```

### Change AI model
File: `app/api/analyze/route.js` (line ~23)
```js
model: 'claude-3-5-haiku-20241022',  // Cheapest
// model: 'claude-sonnet-4-20250514',  // Smarter but costs more
```

### Change Axiom link to something else
File: `components/TokenCard.js` (line ~181)
```js
href={`https://axiom.trade/t/${token.ca}`}
```
Change the URL pattern.

### Add/remove stats displayed
File: `components/TokenCard.js` - look for the `stats` div
Currently shows: MCap, Vol 24h

### Change card styling
File: `components/TokenCard.module.css`

### Change search fields
File: `components/TokenFeed.js` - look for `filteredTokens`

---

## Manual Commands

### Trigger token fetch manually
```bash
curl "https://dex-utility.vercel.app/api/cron" -H "Authorization: Bearer my-super-secret-cron-key-12345"
```

### Clear all tokens (run in Supabase SQL Editor)
```sql
DELETE FROM tokens;
```

### Clear only old tokens
```sql
DELETE FROM tokens WHERE pair_created_at < NOW() - INTERVAL '72 hours';
```

---

## Deployment

Push to GitHub → Vercel auto-deploys

```bash
git add .
git commit -m "Your change description"
git push
```

---

## Troubleshooting

### "Database error: Could not find table"
Run the schema.sql in Supabase SQL Editor.

### AI analysis shows "Failed to parse"
Check ANTHROPIC_API_KEY in Vercel environment variables.

### Tokens not updating
1. Check GitHub Actions ran (repo → Actions tab)
2. Make sure VERCEL_URL and CRON_SECRET secrets are set
3. Manually trigger: Run workflow button

### No tokens showing
1. Check 72-hour filter isn't filtering everything
2. Run manual curl to fetch tokens
3. Check Supabase has data: `SELECT * FROM tokens;`
