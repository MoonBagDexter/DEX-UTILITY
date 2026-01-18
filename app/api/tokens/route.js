import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/tokens - Fetch tokens with filtering and pagination
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Query parameters
    const status = searchParams.get('status') || 'new';
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
    const offset = parseInt(searchParams.get('offset')) || 0;
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Validate sort column to prevent injection
    const allowedSortColumns = ['created_at', 'pair_created_at', 'name', 'ticker'];
    const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder === 'asc';

    // Build query
    let query = supabase
      .from('tokens')
      .select('*', { count: 'exact' });

    // Filter by status
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply sorting and pagination
    query = query
      .order(safeSort, { ascending: safeOrder })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      tokens: data || [],
      total: count || 0,
      limit,
      offset,
      hasMore: (offset + limit) < (count || 0)
    });

  } catch (error) {
    console.error('Tokens GET error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/tokens - Update token status
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { ca, status } = body;

    // Validate required fields
    if (!ca) {
      return NextResponse.json(
        { error: 'Contract address (ca) is required' },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ['new', 'kept', 'deleted'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Update token status
    const { data, error } = await supabase
      .from('tokens')
      .update({ status })
      .eq('ca', ca)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Token not found' },
          { status: 404 }
        );
      }
      throw new Error(`Database error: ${error.message}`);
    }

    return NextResponse.json({
      message: 'Token updated successfully',
      token: data
    });

  } catch (error) {
    console.error('Tokens PATCH error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
