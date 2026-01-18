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
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Is this a MEME coin or does it have real UTILITY? Analyze:

${tokenContext}

Reply with JSON only:
{"classification":"utility" or "meme","confidence":0-100,"reasoning":"1 sentence"}`
        }
      ]
    });

    // Parse the response
    const responseText = message.content[0].text;
    let analysis;

    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
    } catch {
      analysis = {
        classification: 'unknown',
        confidence: 0,
        reasoning: 'Failed to parse AI response'
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
