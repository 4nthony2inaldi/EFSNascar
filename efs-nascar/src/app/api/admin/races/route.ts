import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');

  if (!seasonId) {
    return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
  }

  const { data: races, error } = await supabaseAdmin
    .from('races')
    .select('id, race_number, name, track, status')
    .eq('season_id', seasonId)
    .order('race_number', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ races });
}
