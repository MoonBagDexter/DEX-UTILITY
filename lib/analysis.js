/**
 * AI analysis utilities for token classification
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from './constants';
import { formatNumber } from './format';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Build context string for AI analysis
 * @param {object} token - Token data
 * @returns {string} Context string for analysis
 */
export function buildTokenContext(token) {
  const parts = [];

  parts.push(`Token Name: ${token.name || 'Unknown'}`);
  parts.push(`Ticker: ${token.ticker || 'Unknown'}`);

  if (token.description) {
    parts.push(`Description: ${token.description}`);
  }

  if (token.links && token.links.length > 0) {
    const linkTypes = token.links.map(l => l.type).join(', ');
    parts.push(`Social Links: ${linkTypes}`);

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

/**
 * Analyze a token using Claude AI
 * @param {object} token - Token data
 * @returns {Promise<object>} Analysis result with classification, confidence, reasoning
 */
export async function analyzeToken(token) {
  const tokenContext = buildTokenContext(token);

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
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

  const responseText = message.content[0].text;

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return {
      classification: 'unknown',
      confidence: 0,
      reasoning: 'Failed to parse AI response'
    };
  }
}
