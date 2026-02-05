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
 * Optimized version that fetches all data upfront and does batch updates.
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
  try {
    const supabase = await createClient();
    const startTime = Date.now();

    // Step 1: Fetch ALL data upfront in parallel
    const [driversResult, racesResult, seasonsResult, resultsResult] = await Promise.all([
      supabase.from('drivers').select('id, name, car_number'),
      supabase.from('races').select('id, name, track, race_number, season_id'),
      supabase.from('seasons').select('id, year'),
      supabase.from('race_results').select('id, race_id, driver_id, finish_position, api_driver_name').limit(10000),
    ]);

    if (driversResult.error) {
      return NextResponse.json({ success: false, error: 'Error fetching drivers', details: driversResult.error.message }, { status: 500 });
    }
    if (racesResult.error) {
      return NextResponse.json({ success: false, error: 'Error fetching races', details: racesResult.error.message }, { status: 500 });
    }
    if (resultsResult.error) {
      return NextResponse.json({ success: false, error: 'Error fetching results', details: resultsResult.error.message }, { status: 500 });
    }

    const allDrivers = driversResult.data || [];
    const dbRaces = racesResult.data || [];
    const seasons = seasonsResult.data || [];
    const allDbResults = resultsResult.data || [];

    // Build lookup maps
    const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
    const driverByCarNumber = new Map<number, { id: string; name: string; car_number: number }>();
    for (const d of allDrivers) {
      driverByNormalizedName.set(normalizeDriverName(d.name), d);
      if (d.car_number) {
        driverByCarNumber.set(d.car_number, d);
      }
    }

    const seasonYearMap = new Map<string, number>();
    for (const s of seasons) {
      seasonYearMap.set(s.id, s.year);
    }

    // Build race lookup: race_id -> race info
    const raceInfoMap = new Map<string, { track: string; name: string; race_number: number; year: number }>();
    for (const race of dbRaces) {
      raceInfoMap.set(race.id, {
        track: race.track || race.name || '',
        name: race.name || '',
        race_number: race.race_number,
        year: seasonYearMap.get(race.season_id) || 0,
      });
    }

    // Build JSON race lookup by normalized track + year + race_number
    const jsonRaceMap = new Map<string, JsonRace>();
    for (const race of ALL_RESULTS_DATA) {
      const trackKey = normalizeTrackName(race.track);
      // Primary key: track + year + race_number
      jsonRaceMap.set(`${trackKey}-${race.season}-${race.race_number}`, race);
      // Secondary key: track + year only (fallback)
      if (!jsonRaceMap.has(`${trackKey}-${race.season}`)) {
        jsonRaceMap.set(`${trackKey}-${race.season}`, race);
      }
    }

    // Process all results and collect updates
    const updates: { id: string; driver_id: string; api_driver_name: string; api_car_number: number | null }[] = [];
    const driverFixCounts: Record<string, number> = {};
    let racesMatched = 0;
    let racesNotMatched = 0;
    let totalSkipped = 0;
    const matchedRaceIds = new Set<string>();
    const unmatchedRaceIds = new Set<string>();

    for (const dbResult of allDbResults) {
      const raceInfo = raceInfoMap.get(dbResult.race_id);
      if (!raceInfo) {
        totalSkipped++;
        continue;
      }

      const trackKey = normalizeTrackName(raceInfo.track);

      // Try to find matching JSON race
      let matchingJsonRace =
        jsonRaceMap.get(`${trackKey}-${raceInfo.year}-${raceInfo.race_number}`) ||
        jsonRaceMap.get(`${trackKey}-${raceInfo.year}`);

      // Try fuzzy match if not found
      if (!matchingJsonRace) {
        for (const [key, race] of jsonRaceMap.entries()) {
          if (key.includes(trackKey) && key.includes(`-${raceInfo.year}`)) {
            matchingJsonRace = race;
            break;
          }
        }
      }

      if (!matchingJsonRace) {
        unmatchedRaceIds.add(dbResult.race_id);
        totalSkipped++;
        continue;
      }

      matchedRaceIds.add(dbResult.race_id);

      // Find the JSON result by finish position
      const jsonResult = matchingJsonRace.results.find(r => r.finish === dbResult.finish_position);
      if (!jsonResult) {
        totalSkipped++;
        continue;
      }

      // Find correct driver by name
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
        updates.push({
          id: dbResult.id,
          driver_id: correctDriver.id,
          api_driver_name: jsonResult.driver,
          api_car_number: carNumber,
        });
        driverFixCounts[correctDriver.name] = (driverFixCounts[correctDriver.name] || 0) + 1;
      }
    }

    racesMatched = matchedRaceIds.size;
    racesNotMatched = unmatchedRaceIds.size;

    // Batch update all results (in chunks to avoid hitting limits)
    let totalUpdated = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);

      // Use upsert for each item (Supabase doesn't support bulk update with different values easily)
      for (const update of batch) {
        const { error } = await supabase
          .from('race_results')
          .update({
            driver_id: update.driver_id,
            api_driver_name: update.api_driver_name,
            api_car_number: update.api_car_number,
          })
          .eq('id', update.id);

        if (!error) {
          totalUpdated++;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Top drivers fixed
    const topFixes = Object.entries(driverFixCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      summary: {
        races_in_database: dbRaces.length,
        races_matched_to_json: racesMatched,
        races_not_matched: racesNotMatched,
        results_updated: totalUpdated,
        results_skipped: totalSkipped,
        elapsed_seconds: parseFloat(elapsed),
      },
      top_drivers_fixed: topFixes.map(([name, count]) => ({ driver: name, fixes: count })),
    });
  } catch (error) {
    console.error('Relink error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
