import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Verify user is commissioner
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_commissioner')
      .eq('id', user.id)
      .single();

    if (!profile?.is_commissioner) {
      return NextResponse.json({ error: 'Forbidden - Commissioner access required' }, { status: 403 });
    }

    // Check if API is configured
    if (!nascarApi.isConfigured()) {
      return NextResponse.json({
        error: 'NASCAR API not configured',
        help: 'Add SPORTRADAR_API_KEY to your environment variables. Get your free trial key at https://developer.sportradar.com/',
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    const races = await nascarApi.getRacesForYear(year);

    return NextResponse.json({
      year,
      races: races.map(r => ({
        id: r.id,
        name: r.name,
        scheduled: r.scheduled,
        status: r.status,
        track: r.track?.name || 'Unknown',
      })),
    });
  } catch (error: any) {
    console.error('Error fetching NASCAR schedule:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch schedule',
    }, { status: 500 });
  }
}
