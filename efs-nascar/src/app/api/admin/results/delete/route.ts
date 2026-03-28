import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
  try {
    const { seasonId, raceId } = await request.json();

    if (!seasonId && !raceId) {
      return NextResponse.json({ error: 'Either seasonId or raceId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    if (raceId) {
      // Delete results for a specific race
      const { error } = await supabase
        .from('race_results')
        .delete()
        .eq('race_id', raceId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Reset race status back to 'upcoming'
      await supabase
        .from('races')
        .update({ status: 'upcoming' })
        .eq('id', raceId);

      return NextResponse.json({
        message: `Deleted results for race`,
        deleted: 1
      });
    } else {
      // Delete results for entire season
      // First get all race IDs for this season
      const { data: races, error: racesError } = await supabase
        .from('races')
        .select('id')
        .eq('season_id', seasonId);

      if (racesError) {
        return NextResponse.json({ error: racesError.message }, { status: 500 });
      }

      const raceIds = (races || []).map(r => r.id);

      if (raceIds.length === 0) {
        return NextResponse.json({ message: 'No races found for this season', deleted: 0 });
      }

      // Delete all results for these races
      const { error } = await supabase
        .from('race_results')
        .delete()
        .in('race_id', raceIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Reset race statuses back to 'upcoming'
      await supabase
        .from('races')
        .update({ status: 'upcoming' })
        .in('id', raceIds);

      return NextResponse.json({
        message: `Deleted all results for season`,
        deleted: raceIds.length,
        racesAffected: raceIds.length
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
