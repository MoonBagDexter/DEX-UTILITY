#!/usr/bin/env node

/**
 * Local script to analyze all tokens with Claude AI
 * Run: node scripts/analyze-all.js
 *
 * Requires: ANTHROPIC_API_KEY and NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function analyzeToken(token) {
  const parts = [];
  parts.push(`Token Name: ${token.name || 'Unknown'}`);
  parts.push(`Ticker: ${token.ticker || 'Unknown'}`);
  if (token.description) parts.push(`Description: ${token.description}`);

  if (token.links?.length > 0) {
    const linkTypes = token.links.map(l => l.type).join(', ');
    parts.push(`Social Links: ${linkTypes}`);
    const website = token.links.find(l => l.type === 'website');
    if (website) parts.push(`Website: ${website.url}`);
  }

  if (token.stats) {
    if (token.stats.marketCap) parts.push(`Market Cap: $${formatNumber(token.stats.marketCap)}`);
    if (token.stats.liquidity) parts.push(`Liquidity: $${formatNumber(token.stats.liquidity)}`);
  }

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Is this a MEME coin or does it have real UTILITY? Analyze:\n\n${parts.join('\n')}\n\nReply with JSON only:\n{"classification":"utility" or "meme","confidence":0-100,"reasoning":"1 sentence"}`
    }]
  });

  const text = message.content[0].text;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { classification: 'unknown', confidence: 0 };
  } catch {
    return { classification: 'unknown', confidence: 0, reasoning: 'Parse error' };
  }
}

function formatNumber(num) {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(2);
}

async function main() {
  console.log('Fetching tokens with status=new...\n');

  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('status', 'new');

  if (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  }

  console.log(`Found ${tokens.length} tokens to analyze\n`);

  let kept = 0, deleted = 0, skipped = 0, errors = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const progress = `[${i + 1}/${tokens.length}]`;

    try {
      const analysis = await analyzeToken(token);

      let newStatus = 'new';
      if (analysis.classification === 'utility') {
        newStatus = 'kept';
        kept++;
      } else if (analysis.classification === 'meme') {
        newStatus = 'deleted';
        deleted++;
      } else {
        skipped++;
        console.log(`${progress} SKIP: ${token.ticker} - ${analysis.reasoning || 'unknown'}`);
        continue;
      }

      // Only update status - skip analysis/analyzed_at if columns don't exist
      const { error: updateError } = await supabase
        .from('tokens')
        .update({ status: newStatus })
        .eq('ca', token.ca);

      if (updateError) {
        console.error(`${progress} DB ERROR: ${token.ticker} - ${updateError.message}`);
        errors++;
      } else {
        const icon = newStatus === 'kept' ? '✅' : '❌';
        console.log(`${progress} ${icon} ${newStatus.toUpperCase()}: ${token.ticker} - ${analysis.reasoning}`);
      }
    } catch (err) {
      console.error(`${progress} API ERROR: ${token.ticker} - ${err.message}`);
      errors++;
    }

    // Small delay to respect rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n========== DONE ==========');
  console.log(`✅ Kept:    ${kept}`);
  console.log(`❌ Deleted: ${deleted}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`⚠️  Errors:  ${errors}`);
}

main();
