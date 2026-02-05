import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Import the static JSON data
import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

export const dynamic = 'force-dynamic';

/**
 * Backfill api_driver_name and api_car_number for existing race_results.
 *
 * This endpoint matches existing race_results to the JSON source data
 * by race and finish position, then updates the api_driver_name field.
 *
 * GET: Preview what will be updated (dry run)
 * POST: Execute the backfill
 */

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

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const year = parseInt(searchParams.get('year') || '2025', 10);
  const driverFilter = searchParams.get('driver');

  const supabase = await createClient();

  // Get the season for this year
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('year', year)
    .single();

  if (!season) {
    return NextResponse.json({ error: `Season not found for year ${year}` }, { status: 404 });
  }

  // Get all races for this season with their results
  const { data: races } = await supabase
    .from('races')
    .select('id, race_number, name, track')
    .eq('season_id', season.id);

  // Get all race results that are missing api_driver_name
  let resultsQuery = supabase
    .from('race_results')
    .select('id, race_id, driver_id, finish_position, api_driver_name')
    .in('race_id', (races || []).map(r => r.id));

  if (driverFilter) {
    // First find the driver ID
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, name')
      .ilike('name', `%${driverFilter}%`)
      .single();

    if (driver) {
      resultsQuery = resultsQuery.eq('driver_id', driver.id);
    }
  }

  const { data: results } = await resultsQuery;

  // Get JSON source data for this year
  const jsonData = RESULTS_DATA[year];
  if (!jsonData) {
    return NextResponse.json({ error: `No JSON data for year ${year}` }, { status: 404 });
  }

  // Build a lookup from race -> finish_position -> driver info
  const jsonLookup = new Map<string, Map<number, { driver: string; car: string }>>();

  for (const race of jsonData) {
    const trackKey = normalizeTrackName(race.track);
    if (!jsonLookup.has(trackKey)) {
      jsonLookup.set(trackKey, new Map());
    }
    for (const result of race.results) {
      if (result.finish) {
        jsonLookup.get(trackKey)!.set(result.finish, {
          driver: result.driver,
          car: result.car,
        });
      }
    }
  }

  // Match results to JSON source
  const updates: Array<{
    result_id: string;
    race_name: string;
    finish_position: number;
    current_api_name: string | null;
    new_api_name: string;
    new_car_number: number | null;
  }> = [];

  const noMatch: Array<{
    result_id: string;
    race_name: string;
    finish_position: number;
  }> = [];

  let alreadyHasName = 0;

  for (const result of results || []) {
    // Skip if already has api_driver_name
    if (result.api_driver_name) {
      alreadyHasName++;
      continue;
    }

    // Find the race
    const race = races?.find(r => r.id === result.race_id);
    if (!race) continue;

    // Try to find in JSON by track name
    const trackKey = normalizeTrackName(race.track || '');
    const raceNameKey = normalizeTrackName(race.name || '');

    // Try track name first, then race name
    let positionMap = jsonLookup.get(trackKey);
    if (!positionMap) {
      // Try finding by checking if any JSON track includes our track name
      for (const [jsonTrack, map] of jsonLookup.entries()) {
        if (jsonTrack.includes(trackKey) || trackKey.includes(jsonTrack)) {
          positionMap = map;
          break;
        }
      }
    }

    if (positionMap && result.finish_position) {
      const jsonResult = positionMap.get(result.finish_position);
      if (jsonResult) {
        const carNumber = parseInt(jsonResult.car?.replace(/\D/g, '') || '0', 10) || null;
        updates.push({
          result_id: result.id,
          race_name: race.name,
          finish_position: result.finish_position,
          current_api_name: result.api_driver_name,
          new_api_name: jsonResult.driver,
          new_car_number: carNumber,
        });
      } else {
        noMatch.push({
          result_id: result.id,
          race_name: race.name,
          finish_position: result.finish_position,
        });
      }
    } else {
      noMatch.push({
        result_id: result.id,
        race_name: race.name,
        finish_position: result.finish_position,
      });
    }
  }

  // Filter for specific driver if requested
  let filteredUpdates = updates;
  if (driverFilter) {
    const filterLower = driverFilter.toLowerCase();
    filteredUpdates = updates.filter(u =>
      u.new_api_name.toLowerCase().includes(filterLower)
    );
  }

  return NextResponse.json({
    year,
    driver_filter: driverFilter || 'all',
    summary: {
      total_results: (results || []).length,
      already_has_api_name: alreadyHasName,
      will_update: filteredUpdates.length,
      no_match_found: noMatch.length,
    },
    updates: filteredUpdates.slice(0, 50),
    no_match: noMatch.slice(0, 10),
    instructions: filteredUpdates.length > 0
      ? 'POST to this endpoint to apply the updates'
      : 'No updates needed',
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { year = 2025, driver } = await request.json();

  // Get the season for this year
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('year', year)
    .single();

  if (!season) {
    return NextResponse.json({ error: `Season not found for year ${year}` }, { status: 404 });
  }

  // Get all races for this season
  const { data: races } = await supabase
    .from('races')
    .select('id, race_number, name, track')
    .eq('season_id', season.id);

  // Get race results
  let resultsQuery = supabase
    .from('race_results')
    .select('id, race_id, driver_id, finish_position, api_driver_name')
    .in('race_id', (races || []).map(r => r.id))
    .is('api_driver_name', null);

  if (driver) {
    const { data: driverRecord } = await supabase
      .from('drivers')
      .select('id')
      .ilike('name', `%${driver}%`)
      .single();

    if (driverRecord) {
      resultsQuery = resultsQuery.eq('driver_id', driverRecord.id);
    }
  }

  const { data: results } = await resultsQuery;

  // Get JSON source data
  const jsonData = RESULTS_DATA[year];
  if (!jsonData) {
    return NextResponse.json({ error: `No JSON data for year ${year}` }, { status: 404 });
  }

  // Build lookup
  const jsonLookup = new Map<string, Map<number, { driver: string; car: string }>>();

  for (const race of jsonData) {
    const trackKey = normalizeTrackName(race.track);
    if (!jsonLookup.has(trackKey)) {
      jsonLookup.set(trackKey, new Map());
    }
    for (const result of race.results) {
      if (result.finish) {
        jsonLookup.get(trackKey)!.set(result.finish, {
          driver: result.driver,
          car: result.car,
        });
      }
    }
  }

  // Apply updates
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const result of results || []) {
    const race = races?.find(r => r.id === result.race_id);
    if (!race) {
      skipped++;
      continue;
    }

    const trackKey = normalizeTrackName(race.track || '');

    let positionMap = jsonLookup.get(trackKey);
    if (!positionMap) {
      for (const [jsonTrack, map] of jsonLookup.entries()) {
        if (jsonTrack.includes(trackKey) || trackKey.includes(jsonTrack)) {
          positionMap = map;
          break;
        }
      }
    }

    if (positionMap && result.finish_position) {
      const jsonResult = positionMap.get(result.finish_position);
      if (jsonResult) {
        const carNumber = parseInt(jsonResult.car?.replace(/\D/g, '') || '0', 10) || null;

        const { error } = await supabase
          .from('race_results')
          .update({
            api_driver_name: jsonResult.driver,
            api_car_number: carNumber,
          })
          .eq('id', result.id);

        if (error) {
          errors.push(`Failed to update ${result.id}: ${error.message}`);
        } else {
          updated++;
        }
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    year,
    driver_filter: driver || 'all',
    summary: {
      updated,
      skipped,
      errors: errors.length,
    },
    errors: errors.length > 0 ? errors : undefined,
    next_steps: updated > 0
      ? 'Now run GET /api/admin/relink-results to preview re-linking, then POST to apply'
      : 'No updates were made',
  });
}
