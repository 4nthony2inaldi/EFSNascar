import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Import JSON results data for all relevant years
import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for this operation

/**
 * Comprehensive fix for all race results driver linking.
 *
 * GET: Run the fix and return results
 *
 * This endpoint:
 * 1. Loads all JSON source data
 * 2. Gets all races from the database
 * 3. For each race, matches to JSON data by track name
 * 4. For each result, finds the correct driver by name
 * 5. Updates driver_id and api_driver_name for all results
 */

interface JsonRaceResult {
  finish: number;
  start?: number;
  driver: string;
  team?: string;
  car: string;
  laps_led?: number;
  s1?: number | null;
  s2?: number | null;
  points?: number;
  status?: string;
}

interface JsonRace {
  season: number;
  race_number: number;
  track: string;
  name: string;
  results: JsonRaceResult[];
}

// Combine all years of data
const ALL_RESULTS_DATA: JsonRace[] = [
  ...(results2020 as JsonRace[]),
  ...(results2022 as JsonRace[]),
  ...(results2023 as JsonRace[]),
  ...(results2024 as JsonRace[]),
  ...(results2025 as JsonRace[]),
];

function normalizeTrackName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/speedway|raceway|motorspeedway|international/g, '');
}

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export async function GET() {
  const supabase = await createClient();
  const logs: string[] = [];
  const startTime = Date.now();

  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  log('=== Relinking All Race Results ===');
  log(`JSON data loaded: ${ALL_RESULTS_DATA.length} races across all years`);

  // Step 1: Build driver lookup from database
  log('Step 1: Building driver lookup...');
  const { data: allDrivers, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  if (driverError) {
    return NextResponse.json({ error: 'Error fetching drivers', details: driverError }, { status: 500 });
  }

  // Create multiple lookup maps for flexible matching
  const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
  const driverByCarNumber = new Map<number, { id: string; name: string; car_number: number }>();

  for (const d of allDrivers || []) {
    driverByNormalizedName.set(normalizeDriverName(d.name), d);
    if (d.car_number) {
      driverByCarNumber.set(d.car_number, d);
    }
  }
  log(`  Found ${allDrivers?.length || 0} drivers in database`);

  // Step 2: Build JSON race lookup by track
  log('Step 2: Building JSON race lookup...');
  const jsonRacesByTrack = new Map<string, JsonRace[]>();

  for (const race of ALL_RESULTS_DATA) {
    const trackKey = normalizeTrackName(race.track);
    if (!jsonRacesByTrack.has(trackKey)) {
      jsonRacesByTrack.set(trackKey, []);
    }
    jsonRacesByTrack.get(trackKey)!.push(race);
  }
  log(`  Indexed ${jsonRacesByTrack.size} unique tracks`);

  // Step 3: Get all races from database
  log('Step 3: Fetching database races...');
  const { data: dbRaces, error: racesError } = await supabase
    .from('races')
    .select('id, name, track, race_number, season_id, scheduled_datetime')
    .order('scheduled_datetime', { ascending: false });

  if (racesError) {
    return NextResponse.json({ error: 'Error fetching races', details: racesError }, { status: 500 });
  }

  log(`  Found ${dbRaces?.length || 0} races in database`);

  // Step 4: Get seasons for year lookup
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year');

  const seasonYearMap = new Map<string, number>();
  for (const s of seasons || []) {
    seasonYearMap.set(s.id, s.year);
  }

  // Step 5: Process each race
  log('Step 4: Processing races...');

  let totalUpdated = 0;
  let totalSkipped = 0;
  let racesMatched = 0;
  let racesNotMatched = 0;
  const unmatchedRaces: string[] = [];
  const driverFixCounts: Record<string, number> = {};

  for (const dbRace of dbRaces || []) {
    const trackKey = normalizeTrackName(dbRace.track || dbRace.name || '');
    const year = seasonYearMap.get(dbRace.season_id) || 0;

    // Find matching JSON race
    let matchingJsonRace: JsonRace | null = null;

    // Try exact track match first
    const trackRaces = jsonRacesByTrack.get(trackKey);
    if (trackRaces) {
      // Match by year and race number if available
      matchingJsonRace = trackRaces.find(r =>
        r.season === year && r.race_number === dbRace.race_number
      ) || null;

      // Fallback: match by year only
      if (!matchingJsonRace) {
        matchingJsonRace = trackRaces.find(r => r.season === year) || null;
      }
    }

    // Try fuzzy track match
    if (!matchingJsonRace) {
      for (const [jsonTrack, races] of jsonRacesByTrack.entries()) {
        if (jsonTrack.includes(trackKey) || trackKey.includes(jsonTrack)) {
          matchingJsonRace = races.find(r =>
            r.season === year && r.race_number === dbRace.race_number
          ) || races.find(r => r.season === year) || null;
          if (matchingJsonRace) break;
        }
      }
    }

    if (!matchingJsonRace) {
      racesNotMatched++;
      if (unmatchedRaces.length < 10) {
        unmatchedRaces.push(`${dbRace.name} (${year})`);
      }
      continue;
    }

    racesMatched++;

    // Get race results for this race
    const { data: raceResults } = await supabase
      .from('race_results')
      .select('id, driver_id, finish_position, api_driver_name')
      .eq('race_id', dbRace.id);

    if (!raceResults || raceResults.length === 0) continue;

    // Build JSON results lookup by finish position
    const jsonResultsByPosition = new Map<number, JsonRaceResult>();
    for (const result of matchingJsonRace.results) {
      if (result.finish) {
        jsonResultsByPosition.set(result.finish, result);
      }
    }

    // Update each result
    for (const dbResult of raceResults) {
      const jsonResult = jsonResultsByPosition.get(dbResult.finish_position);
      if (!jsonResult) continue;

      // Find correct driver
      const normalizedJsonName = normalizeDriverName(jsonResult.driver);
      let correctDriver = driverByNormalizedName.get(normalizedJsonName);

      // Fallback: try car number
      if (!correctDriver && jsonResult.car) {
        const carNum = parseInt(jsonResult.car.replace(/\D/g, ''), 10);
        if (carNum) {
          correctDriver = driverByCarNumber.get(carNum);
        }
      }

      if (!correctDriver) {
        totalSkipped++;
        continue;
      }

      // Check if update is needed
      const needsUpdate =
        dbResult.driver_id !== correctDriver.id ||
        dbResult.api_driver_name !== jsonResult.driver;

      if (needsUpdate) {
        const carNumber = parseInt(jsonResult.car?.replace(/\D/g, '') || '0', 10) || null;

        const { error: updateError } = await supabase
          .from('race_results')
          .update({
            driver_id: correctDriver.id,
            api_driver_name: jsonResult.driver,
            api_car_number: carNumber,
          })
          .eq('id', dbResult.id);

        if (!updateError) {
          totalUpdated++;
          driverFixCounts[correctDriver.name] = (driverFixCounts[correctDriver.name] || 0) + 1;
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`=== Complete in ${elapsed}s ===`);
  log(`Races matched to JSON: ${racesMatched}`);
  log(`Races not matched: ${racesNotMatched}`);
  log(`Results updated: ${totalUpdated}`);
  log(`Results skipped (no driver match): ${totalSkipped}`);

  // Top drivers fixed
  const topFixes = Object.entries(driverFixCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return NextResponse.json({
    success: true,
    summary: {
      races_in_database: dbRaces?.length || 0,
      races_matched_to_json: racesMatched,
      races_not_matched: racesNotMatched,
      results_updated: totalUpdated,
      results_skipped: totalSkipped,
      elapsed_seconds: parseFloat(elapsed),
    },
    top_drivers_fixed: topFixes.map(([name, count]) => ({ driver: name, fixes: count })),
    unmatched_races_sample: unmatchedRaces,
    logs,
  });
}
