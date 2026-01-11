import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

// Match JSON race data to database race by track name
function findMatchingRace(
  raceData: RaceData,
  dbRaces: Array<{ id: string; race_number: number; name: string; track_name: string | null }>,
  alreadyMatched: Set<string>
): { id: string; race_number: number; name: string } | null {
  const jsonTrack = normalizeTrackName(raceData.track);
  const jsonRaceName = normalizeTrackName(raceData.name);

  // Find all races at this track that haven't been matched yet
  const trackMatches = dbRaces.filter(r => {
    if (alreadyMatched.has(r.id)) return false;
    const dbTrack = normalizeTrackName(r.track_name || '');
    const dbName = normalizeTrackName(r.name);
    // Match by track name or race name containing track info
    return dbTrack.includes(jsonTrack) || jsonTrack.includes(dbTrack) ||
           dbName.includes(jsonTrack) || jsonTrack.includes(dbName) ||
           dbTrack.includes(jsonRaceName) || jsonRaceName.includes(dbTrack);
  });

  if (trackMatches.length === 0) {
    return null;
  }

  if (trackMatches.length === 1) {
    return trackMatches[0];
  }

  // Multiple matches (e.g., 2 Atlanta races) - pick the one with closest race_number
  // Sort by race_number and pick the first unmatched one
  const sorted = [...trackMatches].sort((a, b) => a.race_number - b.race_number);
  return sorted[0];
}

export async function POST(request: NextRequest) {
  try {
    const { year, raceNumber } = await request.json();

    if (!year) {
      return NextResponse.json({ error: 'Year is required' }, { status: 400 });
    }

    const resultsData = RESULTS_DATA[year];
    if (!resultsData) {
      return NextResponse.json({
        error: `No data available for ${year}. Available years: ${Object.keys(RESULTS_DATA).join(', ')}`
      }, { status: 400 });
    }

    const supabase = await createClient();

    // Get the season for this year
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', year)
      .single();

    if (seasonError || !season) {
      return NextResponse.json({ error: `Season not found for year ${year}` }, { status: 400 });
    }

    // Get all races for this season with track info
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, race_number, name, tracks(name)')
      .eq('season_id', season.id)
      .order('race_number', { ascending: true });

    // Flatten track name for easier access
    const racesWithTrack = (races || []).map(r => ({
      id: r.id,
      race_number: r.race_number,
      name: r.name,
      track_name: (r.tracks as any)?.name || null
    }));

    if (racesError) {
      return NextResponse.json({ error: racesError.message }, { status: 500 });
    }

    // Get all drivers
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, name');

    if (driversError) {
      return NextResponse.json({ error: driversError.message }, { status: 500 });
    }

    // Create driver name lookup map
    const driverMap = new Map<string, string>();
    for (const driver of drivers || []) {
      driverMap.set(normalizeDriverName(driver.name), driver.id);
    }

    // Filter to specific race if provided
    const racesToImport = raceNumber
      ? resultsData.filter(r => r.race_number === raceNumber)
      : resultsData;

    let totalImported = 0;
    let totalSkipped = 0;
    let driversNotFound: string[] = [];
    let racesNotFound: string[] = [];
    const raceResults: { race: string; imported: number; skipped: number; dbRace: string }[] = [];
    const alreadyMatchedRaces = new Set<string>();

    for (const raceData of racesToImport) {
      // Find matching race in database by track name
      const race = findMatchingRace(raceData, racesWithTrack, alreadyMatchedRaces);
      if (!race) {
        racesNotFound.push(`${raceData.name} @ ${raceData.track}`);
        continue;
      }
      alreadyMatchedRaces.add(race.id);

      // Delete existing results for this race
      await supabase
        .from('race_results')
        .delete()
        .eq('race_id', race.id);

      let imported = 0;
      let skipped = 0;

      // Import each result
      for (const result of raceData.results) {
        if (!result.finish) {
          skipped++;
          continue;
        }

        // Find driver
        const driverId = driverMap.get(normalizeDriverName(result.driver));
        if (!driverId) {
          if (!driversNotFound.includes(result.driver)) {
            driversNotFound.push(result.driver);
          }
          skipped++;
          continue;
        }

        // Determine stage winners (position 1 in stage = winner)
        const stage1Winner = result.s1 === 1;
        const stage2Winner = result.s2 === 1;

        // Find who led most laps in this race
        const maxLapsLed = Math.max(...raceData.results.map(r => r.laps_led || 0));
        const mostLapsLed = result.laps_led > 0 && result.laps_led === maxLapsLed;

        const { error: insertError } = await supabase
          .from('race_results')
          .insert({
            race_id: race.id,
            driver_id: driverId,
            finish_position: result.finish,
            stage_1_winner: stage1Winner,
            stage_2_winner: stage2Winner,
            laps_led: result.laps_led || 0,
            most_laps_led: mostLapsLed,
          });

        if (insertError) {
          console.error(`Error inserting result for ${result.driver}:`, insertError);
          skipped++;
        } else {
          imported++;
        }
      }

      totalImported += imported;
      totalSkipped += skipped;
      raceResults.push({ race: raceData.name, imported, skipped, dbRace: race.name });
    }

    // Update race status to 'final' for imported races
    if (alreadyMatchedRaces.size > 0) {
      const raceIds = Array.from(alreadyMatchedRaces);
      await supabase
        .from('races')
        .update({ status: 'final' })
        .in('id', raceIds);
    }

    return NextResponse.json({
      success: true,
      year,
      totalImported,
      totalSkipped,
      racesImported: raceResults.length,
      raceResults: raceResults.slice(0, 10), // Show first 10
      driversNotFound: driversNotFound.slice(0, 20), // Show first 20
      racesNotFound,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    availableYears: Object.keys(RESULTS_DATA).map(Number),
    description: 'POST with { year: number, raceNumber?: number } to import results',
  });
}
