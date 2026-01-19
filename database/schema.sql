-- Util Finder Database Schema
-- Run this in Supabase SQL Editor to create the tokens table

-- Create the tokens table
CREATE TABLE IF NOT EXISTS tokens (
    -- Primary Key: Contract Address
    ca TEXT PRIMARY KEY,

    -- Token Info
    name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    description TEXT,
    image_url TEXT,

    -- Social Links (stored as JSON array)
    -- Example: [{"type": "twitter", "url": "..."}, {"type": "website", "url": "..."}]
    links JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pair_created_at TIMESTAMP WITH TIME ZONE,

    -- DEX Information
    dex_id TEXT,

    -- Status: 'new', 'kept', 'deleted'
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'kept', 'deleted')),

    -- Stats snapshot (Market Cap, Volume, etc.)
    -- Example: {"marketCap": 100000, "volume24h": 50000, "priceUsd": "0.001"}
    stats JSONB DEFAULT '{}'::jsonb,

    -- Auto-analysis results (from Claude AI)
    -- Example: {"classification": "utility", "confidence": 85, "reasoning": "..."}
    analysis JSONB,
    analyzed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_pair_created_at ON tokens(pair_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_dex_id ON tokens(dex_id);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all operations (adjust based on your auth needs)
-- For a public app without auth, you can use this permissive policy:
CREATE POLICY "Allow all operations on tokens" ON tokens
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant permissions to anon and authenticated roles
GRANT ALL ON tokens TO anon;
GRANT ALL ON tokens TO authenticated;
