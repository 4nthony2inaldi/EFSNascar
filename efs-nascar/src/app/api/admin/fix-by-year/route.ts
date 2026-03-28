import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Fix race results for a specific year only.
 * This is faster and won't timeout.
 *
 * Usage: GET /api/admin/fix-by-year?year=2025
 */

interface JsonRaceResult {
  finish: number;
  driver: string;
  car: string;
}

interface JsonRace {
  season: number;
  race_number: number;
  track: string;
  name: string;
  results: JsonRaceResult[];
}

const DATA_BY_YEAR: Record<number, JsonRace[]> = {
  2020: results2020 as JsonRace[],
  2022: results2022 as JsonRace[],
  2023: results2023 as JsonRace[],
  2024: results2024 as JsonRace[],
  2025: results2025 as JsonRace[],
};

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/speedway|raceway|motorspeedway|international/g, '');
}

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');

    if (!yearParam) {
      return NextResponse.json({
        success: false,
        error: 'Missing year parameter',
        usage: 'GET /api/admin/fix-by-year?year=2025',
        available_years: Object.keys(DATA_BY_YEAR),
      }, { status: 400 });
    }

    const year = parseInt(yearParam, 10);
    const jsonData = DATA_BY_YEAR[year];

    if (!jsonData) {
      return NextResponse.json({
        success: false,
        error: `No data for year ${year}`,
        available_years: Object.keys(DATA_BY_YEAR),
      }, { status: 400 });
    }

    const supabase = await createClient();
    const startTime = Date.now();

    // Get all drivers
    const { data: allDrivers, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, car_number');

    if (driverError) {
      return NextResponse.json({ success: false, error: 'Error fetching drivers', details: driverError.message }, { status: 500 });
    }

    // Build driver lookup
    const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
    const driverByCarNumber = new Map<number, { id: string; name: string; car_number: number }>();

    for (const d of allDrivers || []) {
      driverByNormalizedName.set(normalizeDriverName(d.name), d);
      if (d.car_number) {
        driverByCarNumber.set(d.car_number, d);
      }
    }

    // Get the season for this year
    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', year)
      .single();

    if (!season) {
      return NextResponse.json({ success: false, error: `No season found for year ${year}` }, { status: 404 });
    }

    // Get all races for this season
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, name, track, race_number')
      .eq('season_id', season.id);

    if (racesError) {
      return NextResponse.json({ success: false, error: 'Error fetching races', details: racesError.message }, { status: 500 });
    }

    // Build JSON race lookup
    const jsonRaceMap = new Map<string, JsonRace>();
    for (const race of jsonData) {
      const trackKey = normalizeTrackName(race.track);
      jsonRaceMap.set(`${trackKey}-${race.race_number}`, race);
      if (!jsonRaceMap.has(trackKey)) {
        jsonRaceMap.set(trackKey, race);
      }
    }

    let totalUpdated = 0;
    let totalSkipped = 0;
    let racesProcessed = 0;
    const driverFixCounts: Record<string, number> = {};

    // Process each race
    for (const dbRace of races || []) {
      const trackKey = normalizeTrackName(dbRace.track || dbRace.name || '');

      // Find matching JSON race
      const matchingJsonRace =
        jsonRaceMap.get(`${trackKey}-${dbRace.race_number}`) ||
        jsonRaceMap.get(trackKey);

      if (!matchingJsonRace) {
        continue;
      }

      racesProcessed++;

      // Get results for this race
      const { data: raceResults } = await supabase
        .from('race_results')
        .select('id, driver_id, finish_position, api_driver_name')
        .eq('race_id', dbRace.id);

      if (!raceResults || raceResults.length === 0) continue;

      // Process each result
      for (const dbResult of raceResults) {
        const jsonResult = matchingJsonRace.results.find(r => r.finish === dbResult.finish_position);
        if (!jsonResult) {
          totalSkipped++;
          continue;
        }

        // Find correct driver
        const normalizedJsonName = normalizeDriverName(jsonResult.driver);
        let correctDriver = driverByNormalizedName.get(normalizedJsonName);

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

        // Update if needed
        if (dbResult.driver_id !== correctDriver.id || dbResult.api_driver_name !== jsonResult.driver) {
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

    const topFixes = Object.entries(driverFixCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      year,
      summary: {
        races_in_season: races?.length || 0,
        races_processed: racesProcessed,
        results_updated: totalUpdated,
        results_skipped: totalSkipped,
        elapsed_seconds: parseFloat(elapsed),
      },
      top_drivers_fixed: topFixes.map(([name, count]) => ({ driver: name, fixes: count })),
    });
  } catch (error) {
    console.error('Fix by year error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
