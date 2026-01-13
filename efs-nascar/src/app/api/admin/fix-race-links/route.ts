import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Import the static JSON data
import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

interface RaceResult {
  finish: number | null;
  start: number | null;
  driver: string;
  team: string;
  car: string;
  laps_led: number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  points: number;
  status: string;
}

interface RaceData {
  season: number;
  race_number: number;
  track: string;
  name: string;
  results: RaceResult[];
}

const RESULTS_DATA: Record<number, RaceData[]> = {
  2020: results2020 as RaceData[],
  2022: results2022 as RaceData[],
  2023: results2023 as RaceData[],
  2024: results2024 as RaceData[],
  2025: results2025 as RaceData[],
};

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// GET: Show all races in a season with their current results mapping
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

    // Get all races with result counts
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select(`
        id,
        race_number,
        name,
        track,
        scheduled_datetime,
        status,
        race_results(count)
      `)
      .eq('season_id', season.id)
      .order('race_number', { ascending: true });

    if (racesError) {
      return NextResponse.json({ error: racesError.message }, { status: 500 });
    }

    // Get JSON data for this year
    const jsonRaces = RESULTS_DATA[year] || [];

    // Map races with their data
    const racesWithInfo = (races || []).map(r => {
      const resultCount = Array.isArray(r.race_results)
        ? r.race_results.length
        : ((r.race_results as any)?.[0]?.count || 0);

      // Find potential JSON matches by track
      const normalizedTrack = normalizeTrackName(r.track);
      const potentialJsonMatches = jsonRaces.filter(jr => {
        const jsonTrack = normalizeTrackName(jr.track);
        return jsonTrack.includes(normalizedTrack) || normalizedTrack.includes(jsonTrack);
      });

      return {
        id: r.id,
        race_number: r.race_number,
        name: r.name,
        track: r.track,
        scheduled_datetime: r.scheduled_datetime,
        status: r.status,
        result_count: resultCount,
        potential_json_matches: potentialJsonMatches.map(jr => ({
          race_number: jr.race_number,
          track: jr.track,
          name: jr.name,
          result_count: jr.results.length,
        })),
      };
    });

    return NextResponse.json({
      year,
      season_id: season.id,
      races: racesWithInfo,
      json_races: jsonRaces.map(jr => ({
        race_number: jr.race_number,
        track: jr.track,
        name: jr.name,
        result_count: jr.results.length,
      })),
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Re-import results from a specific JSON race to a specific DB race
export async function POST(request: NextRequest) {
  try {
    const { db_race_id, json_race_number, year } = await request.json();

    if (!db_race_id || !json_race_number || !year) {
      return NextResponse.json({
        error: 'Required: db_race_id, json_race_number, year'
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

    // Get JSON data
    const jsonRaces = RESULTS_DATA[year];
    if (!jsonRaces) {
      return NextResponse.json({ error: `No data for year ${year}` }, { status: 400 });
    }

    const jsonRace = jsonRaces.find(r => r.race_number === json_race_number);
    if (!jsonRace) {
      return NextResponse.json({ error: `JSON race #${json_race_number} not found` }, { status: 400 });
    }

    // Verify DB race exists
    const { data: dbRace, error: raceError } = await supabase
      .from('races')
      .select('id, name, track')
      .eq('id', db_race_id)
      .single();

    if (raceError || !dbRace) {
      return NextResponse.json({ error: 'Database race not found' }, { status: 400 });
    }

    // Get all drivers
    const { data: drivers } = await supabase.from('drivers').select('id, name');
    const driverMap = new Map<string, string>();
    for (const driver of drivers || []) {
      driverMap.set(normalizeDriverName(driver.name), driver.id);
    }

    // Delete existing results for this race
    await supabase
      .from('race_results')
      .delete()
      .eq('race_id', db_race_id);

    // Also delete race_scores for this race (they'll be recalculated)
    await supabase
      .from('race_scores')
      .delete()
      .eq('race_id', db_race_id);

    let imported = 0;
    let skipped = 0;
    const driversNotFound: string[] = [];

    // Import results
    for (const result of jsonRace.results) {
      if (!result.finish) {
        skipped++;
        continue;
      }

      const driverId = driverMap.get(normalizeDriverName(result.driver));
      if (!driverId) {
        if (!driversNotFound.includes(result.driver)) {
          driversNotFound.push(result.driver);
        }
        skipped++;
        continue;
      }

      const stage1Winner = result.s1 === 1;
      const stage2Winner = result.s2 === 1;
      const stage3Winner = result.s3 === 1;

      const maxLapsLed = Math.max(...jsonRace.results.map(r => r.laps_led || 0));
      const mostLapsLed = result.laps_led > 0 && result.laps_led === maxLapsLed;

      const carNumber = parseInt(result.car?.replace(/\D/g, '') || '0', 10) || null;

      const { error: insertError } = await supabase
        .from('race_results')
        .insert({
          race_id: db_race_id,
          driver_id: driverId,
          finish_position: result.finish,
          stage_1_winner: stage1Winner,
          stage_2_winner: stage2Winner,
          stage_3_winner: stage3Winner,
          laps_led: result.laps_led || 0,
          most_laps_led: mostLapsLed,
          api_driver_name: result.driver,
          api_car_number: carNumber,
        });

      if (insertError) {
        console.error(`Error inserting result for ${result.driver}:`, insertError);
        skipped++;
      } else {
        imported++;
      }
    }

    // Update race status to 'final'
    await supabase
      .from('races')
      .update({ status: 'final' })
      .eq('id', db_race_id);

    return NextResponse.json({
      success: true,
      db_race: {
        id: dbRace.id,
        name: dbRace.name,
        track: dbRace.track,
      },
      json_race: {
        race_number: jsonRace.race_number,
        name: jsonRace.name,
        track: jsonRace.track,
      },
      imported,
      skipped,
      driversNotFound: driversNotFound.slice(0, 10),
    });
  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
