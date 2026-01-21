import { NextResponse } from 'next/server';
import { buildTokenContext, analyzeToken } from '@/lib/analysis';

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

    const analysis = await analyzeToken(token);

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
