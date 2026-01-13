import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Pick {
  id: string;
  team: { id: string; name: string };
  driver_1: { id: string; name: string };
  driver_2: { id: string; name: string };
  driver_3: { id: string; name: string };
}

interface RaceWithPicks {
  id: string;
  race_number: number;
  name: string;
  track: string;
  scheduled_datetime: string;
  race_type: string;
  pick_count: number;
  picks: Pick[];
  duplicate_track_races: Array<{
    id: string;
    race_number: number;
    name: string;
    scheduled_datetime: string;
    pick_count: number;
  }>;
}

// GET: Show all races in a season with their picks and potential re-link targets
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '0', 10);

    if (!year) {
      return NextResponse.json({ error: 'Year parameter required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const regularClient = await createClient();
    const supabase = adminClient || regularClient;

    // Get season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', year)
      .single();

    if (seasonError || !season) {
      return NextResponse.json({ error: `Season not found for year ${year}` }, { status: 400 });
    }

    // Get all races with pick counts
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select(`
        id,
        race_number,
        name,
        track,
        scheduled_datetime,
        race_type
      `)
      .eq('season_id', season.id)
      .order('race_number', { ascending: true });

    if (racesError) {
      return NextResponse.json({ error: racesError.message }, { status: 500 });
    }

    // Get all picks for this season's races with team and driver info
    const raceIds = (races || []).map(r => r.id);
    const { data: allPicks, error: picksError } = await supabase
      .from('picks')
      .select(`
        id,
        race_id,
        team:teams!picks_team_id_fkey(id, name),
        driver_1:drivers!picks_driver_1_id_fkey(id, name),
        driver_2:drivers!picks_driver_2_id_fkey(id, name),
        driver_3:drivers!picks_driver_3_id_fkey(id, name)
      `)
      .in('race_id', raceIds);

    if (picksError) {
      return NextResponse.json({ error: picksError.message }, { status: 500 });
    }

    // Group picks by race
    const picksByRace = new Map<string, Pick[]>();
    for (const pick of allPicks || []) {
      const raceId = pick.race_id;
      if (!picksByRace.has(raceId)) {
        picksByRace.set(raceId, []);
      }
      picksByRace.get(raceId)!.push({
        id: pick.id,
        team: pick.team as { id: string; name: string },
        driver_1: pick.driver_1 as { id: string; name: string },
        driver_2: pick.driver_2 as { id: string; name: string },
        driver_3: pick.driver_3 as { id: string; name: string },
      });
    }

    // Find duplicate tracks
    const trackToRaces = new Map<string, Array<{ id: string; race_number: number; name: string; scheduled_datetime: string; pick_count: number }>>();
    for (const race of races || []) {
      const normalizedTrack = normalizeTrackName(race.track);
      if (!trackToRaces.has(normalizedTrack)) {
        trackToRaces.set(normalizedTrack, []);
      }
      trackToRaces.get(normalizedTrack)!.push({
        id: race.id,
        race_number: race.race_number,
        name: race.name,
        scheduled_datetime: race.scheduled_datetime,
        pick_count: picksByRace.get(race.id)?.length || 0,
      });
    }

    // Map races with their data
    const racesWithInfo: RaceWithPicks[] = (races || []).map(r => {
      const normalizedTrack = normalizeTrackName(r.track);
      const sameTrackRaces = trackToRaces.get(normalizedTrack) || [];

      // Only include other races at same track (not self)
      const duplicateTrackRaces = sameTrackRaces
        .filter(other => other.id !== r.id)
        .sort((a, b) => a.race_number - b.race_number);

      return {
        id: r.id,
        race_number: r.race_number,
        name: r.name,
        track: r.track,
        scheduled_datetime: r.scheduled_datetime,
        race_type: r.race_type,
        pick_count: picksByRace.get(r.id)?.length || 0,
        picks: picksByRace.get(r.id) || [],
        duplicate_track_races: duplicateTrackRaces,
      };
    });

    return NextResponse.json({
      year,
      season_id: season.id,
      races: racesWithInfo,
      total_picks: allPicks?.length || 0,
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Move picks from one race to another
export async function POST(request: NextRequest) {
  try {
    const { source_race_id, target_race_id, pick_ids } = await request.json();

    if (!source_race_id || !target_race_id) {
      return NextResponse.json({
        error: 'Required: source_race_id, target_race_id'
      }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const regularClient = await createClient();
    const supabase = adminClient || regularClient;

    // Verify commissioner access
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify both races exist and get their info
    const { data: sourceRace } = await supabase
      .from('races')
      .select('id, name, track, race_number')
      .eq('id', source_race_id)
      .single();

    const { data: targetRace } = await supabase
      .from('races')
      .select('id, name, track, race_number')
      .eq('id', target_race_id)
      .single();

    if (!sourceRace || !targetRace) {
      return NextResponse.json({ error: 'Source or target race not found' }, { status: 400 });
    }

    // Determine which picks to move
    let picksToMove: string[] = [];

    if (pick_ids && Array.isArray(pick_ids) && pick_ids.length > 0) {
      // Move specific picks
      picksToMove = pick_ids;
    } else {
      // Move all picks from source race
      const { data: sourcePicks } = await supabase
        .from('picks')
        .select('id')
        .eq('race_id', source_race_id);

      picksToMove = (sourcePicks || []).map(p => p.id);
    }

    if (picksToMove.length === 0) {
      return NextResponse.json({ error: 'No picks to move' }, { status: 400 });
    }

    // Check for conflicts (team already has picks for target race)
    const { data: picksWithTeams } = await supabase
      .from('picks')
      .select('id, team_id')
      .in('id', picksToMove);

    const teamIdsToMove = new Set((picksWithTeams || []).map(p => p.team_id));

    const { data: existingTargetPicks } = await supabase
      .from('picks')
      .select('id, team_id, team:teams!picks_team_id_fkey(name)')
      .eq('race_id', target_race_id)
      .in('team_id', Array.from(teamIdsToMove));

    if (existingTargetPicks && existingTargetPicks.length > 0) {
      const conflictTeams = existingTargetPicks.map(p => (p.team as any)?.name || 'Unknown');
      return NextResponse.json({
        error: `Cannot move picks: Teams already have picks for target race: ${conflictTeams.join(', ')}`
      }, { status: 400 });
    }

    // Move the picks
    const { error: updateError, count } = await supabase
      .from('picks')
      .update({ race_id: target_race_id })
      .in('id', picksToMove);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      moved: picksToMove.length,
      source_race: {
        id: sourceRace.id,
        name: sourceRace.name,
        race_number: sourceRace.race_number,
      },
      target_race: {
        id: targetRace.id,
        name: targetRace.name,
        race_number: targetRace.race_number,
      },
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
