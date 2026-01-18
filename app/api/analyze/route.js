import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    const token = await request.json();

    // Validate required fields
    if (!token.ca) {
      return NextResponse.json(
        { error: 'Contract address (ca) is required' },
        { status: 400 }
      );
    }

    // Build context for analysis
    const tokenContext = buildTokenContext(token);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Analyze this Solana token and determine if it's a UTILITY token or a MEME coin.

${tokenContext}

Respond with a JSON object containing:
- "classification": either "utility" or "meme"
- "confidence": a number from 0-100 indicating your confidence
- "reasoning": a brief 1-2 sentence explanation
- "redFlags": an array of any concerning patterns (empty array if none)
- "utilityScore": a number from 0-100 (100 = pure utility, 0 = pure meme)

Only respond with the JSON object, no other text.`
        }
      ]
    });

    // Parse the response
    const responseText = message.content[0].text;
    let analysis;

    try {
      analysis = JSON.parse(responseText);
    } catch {
      // If parsing fails, return a default structure
      analysis = {
        classification: 'unknown',
        confidence: 0,
        reasoning: 'Failed to parse AI response',
        redFlags: ['Analysis parsing error'],
        utilityScore: 50
      };
    }

    return NextResponse.json({
      ca: token.ca,
      analysis,
      analyzedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analyze API error:', error);

    // Handle specific Anthropic errors
    if (error.status === 401) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}

function buildTokenContext(token) {
  const parts = [];

  parts.push(`Token Name: ${token.name || 'Unknown'}`);
  parts.push(`Ticker: ${token.ticker || 'Unknown'}`);

  if (token.description) {
    parts.push(`Description: ${token.description}`);
  }

  if (token.links && token.links.length > 0) {
    const linkTypes = token.links.map(l => l.type).join(', ');
    parts.push(`Social Links: ${linkTypes}`);

    // Check for website
    const website = token.links.find(l => l.type === 'website');
    if (website) {
      parts.push(`Website: ${website.url}`);
    }
  }

  if (token.stats) {
    if (token.stats.marketCap) {
      parts.push(`Market Cap: $${formatNumber(token.stats.marketCap)}`);
    }
    if (token.stats.liquidity) {
      parts.push(`Liquidity: $${formatNumber(token.stats.liquidity)}`);
    }
    if (token.stats.volume24h) {
      parts.push(`24h Volume: $${formatNumber(token.stats.volume24h)}`);
    }
  }

  return parts.join('\n');
}

function formatNumber(num) {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}
