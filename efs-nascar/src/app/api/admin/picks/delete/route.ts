import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const { raceId, seasonId } = await request.json();

    if (!raceId && !seasonId) {
      return NextResponse.json({ error: 'Must provide raceId or seasonId' }, { status: 400 });
    }

    const supabase = await createClient();

    if (raceId) {
      // Delete picks for a specific race
      const { data, error } = await supabase
        .from('picks')
        .delete()
        .eq('race_id', raceId)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        message: `Deleted ${data?.length || 0} picks for race`,
        deleted: data?.length || 0
      });
    }

    if (seasonId) {
      // Get all race IDs for the season
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('id')
        .eq('season_id', seasonId);

      if (racesError) {
        return NextResponse.json({ error: racesError.message }, { status: 500 });
      }

      if (!races || races.length === 0) {
        return NextResponse.json({ message: 'No races found for season', deleted: 0 });
      }

      const raceIds = races.map(r => r.id);

      // Delete all picks for those races
      const { data, error } = await supabase
        .from('picks')
        .delete()
        .in('race_id', raceIds)
        .select('id');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        message: `Deleted ${data?.length || 0} picks for season (${races.length} races)`,
        deleted: data?.length || 0
      });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
