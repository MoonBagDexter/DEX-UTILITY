# Util Finder - System Architecture & Implementation Guide

## Project Overview
**Goal**: Build a "Daily List" web application to track new Solana tokens. The system collects tokens 24/7 via a background cron job (The Collector), saving them to a Supabase database. The frontend validates these tokens against a "Kept/Deleted" list, allowing the user to filter "Utility" vs "Meme" projects with AI assistance.

## Technology Stack
- **Framework**: Next.js (App Router).
- **Styling**: Vanilla CSS (CSS Modules or Global Variables). *Do not use Tailwind unless necessary.*
- **Database**: Supabase (PostgreSQL).
- **AI**: Anthropic Claude 3 Haiku (via API).
- **Deployment**: Vercel.

## Infrastructure & Configuration

### 1. Environment Variables
Create a `.env.local` file with the following:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=sk-ant-...  # For AI Analysis
CRON_SECRET=make_up_a_secure_string # For securing the collector endpoint
```

### 2. Database Schema (Supabase)
Create a table named `tokens` with the following columns:
- `ca` (text, Primary Key): Contract Address.
- `name` (text): Token Name.
- `ticker` (text): Token Symbol.
- `description` (text): Description.
- `image_url` (text): URL to token icon.
- `links` (jsonb): Array of social links (Twitter, Website, Telegram).
- `created_at` (timestamp): When the row was added (Collector timestamp).
- `pair_created_at` (timestamp): When the pair was created on-chain.
- `dex_id` (text): e.g., 'pumpswap', 'raydium'.
- `status` (text): 'new', 'kept', 'deleted'. Default: 'new'.
- `stats` (jsonb): Store snapshot of stats (Market Cap, Volume) at time of fetch.

## Core Components

### 1. The Collector (Cron Job)
**Path**: `app/api/cron/route.js`
- **Trigger**: Called every 30 minutes via GitHub Actions or Vercel Cron.
- **Logic**:
    1.  Fetch "Latest Profiles" from DexScreener: `https://api.dexscreener.com/token-profiles/latest/v1`.
    2.  Filter:
        -   Dex ID matches target (e.g., `pumpswap` or all Solana).
        -   Age < 24 hours.
    3.  Loop through results and `UPSERT` into Supabase `tokens` table.
        -   *Crucial*: Do NOT overwrite `status` if it is already 'kept' or 'deleted'. Only update `stats` or inert new rows.
- **Security**: Check `Authorization` header against `CRON_SECRET`.

### 2. The API Proxy
**Path**: `app/api/tokens/route.js`
- **Purpose**: Fetch displayable tokens for the frontend.
- **Logic**:
    1.  Query Supabase `tokens` table.
    2.  Filter: `status = 'new'`.
    3.  Sort: `pair_created_at` DESC (Youngest first).
    4.  Return JSON list.

### 3. AI Analysis Endpoint
**Path**: `app/api/analyze/route.js`
- **Input JSON**: `{ name, ticker, description, social_links, website_content }`
- **Logic**:
    -   Send prompt to Claude Haiku.
    -   **Prompt**: "Analyze this Solana token. If it describes a software tool, utility, or tech product, respond 'KEEP'. If it describes a meme, animal, community takeover, or generic hype, respond 'DELETE'."
- **Output**: JSON `{ recommendation: "KEEP" | "DELETE" }`.

## UI/UX Specification

### Global Styles
- **Theme**: Dark Mode default. High contrast.
- **Font**: Inter or similar clean sans-serif.
- **Variables**: Define `--nav-height`, `--card-bg`, `--primary-accent` in `globals.css`.

### Components

#### `Card.js`
- **Layout**: Grid/Flex.
    -   **Left**: Description (Max 3 lines, truncate with ellipsis).
    -   **Middle**: Image (64x64), Name, Ticker, [X] Embed (or link button), [Website] button. High-visibility **Copy CA** feature (click to copy).
    -   **Right**: Stats.
        -   **Market Cap** (Current).
        -   **Volume** (24h).
        -   **Age** (Time since creation).
- **Actions**:
    -   **Check AI**: Triggers `api/analyze`. Shows loading spinner, then result icon.
    -   **Keep (✓)**: Optimistically sets state to 'kept' (waiting for DB), moves card to list bottom or removes it.
    -   **Delete (X)**: **Standard State Update**: Send request to API to update `status` to 'deleted'. On success, remove card from view. (No optimistic UI to prevent glitches).

#### `Feed.js`
- Fetches tokens from `api/tokens` on mount.
- Renders list of `Card` components.
- Handles empty states ("No new tokens").

#### Management Views
- **'/kept'**: View tokens with `status = 'kept'`. Undo button sets `status = 'new'`.
- **'/deleted'**: View tokens with `status = 'deleted'`. Undo button sets `status = 'new'`.

## Deployment Steps
1.  **Supabase**: Run SQL script to create table.
2.  **Next.js**: Build and Deploy.
3.  **Cron**:
    -   **GitHub Actions**: Create `.github/workflows/cron.yml` to curl the endpoint every 30 mins.
    -   **Environment**: Add `CRON_SECRET` to GitHub Secrets.
