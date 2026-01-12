import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

export const dynamic = 'force-dynamic';

/**
 * Fix race wins (P1 finishes) specifically.
 * This endpoint matches P1 results to JSON data and fixes driver_id linking.
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

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET() {
  const supabase = await createClient();

  // Get all drivers for lookup
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverByNormalizedName = new Map<string, { id: string; name: string }>();
  for (const d of allDrivers || []) {
    driverByNormalizedName.set(normalizeDriverName(d.name), { id: d.id, name: d.name });
  }

  // Get all P1 (win) results
  const { data: winResults, error: winError } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      api_driver_name,
      api_car_number
    `)
    .eq('finish_position', 1);

  if (winError) {
    return NextResponse.json({ error: winError.message }, { status: 500 });
  }

  // Get races for these results
  const raceIds = [...new Set(winResults?.map(r => r.race_id) || [])];
  const { data: races } = await supabase
    .from('races')
    .select('id, name, track, race_number, season_id')
    .in('id', raceIds);

  // Get seasons
  const seasonIds = [...new Set(races?.map(r => r.season_id) || [])];
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year')
    .in('id', seasonIds);

  const seasonYearMap = new Map(seasons?.map(s => [s.id, s.year]) || []);
  const raceInfoMap = new Map(races?.map(r => [r.id, {
    ...r,
    year: seasonYearMap.get(r.season_id) || 0
  }]) || []);

  // Build JSON winner lookup: normalized_track -> year -> winner driver name
  const jsonWinners = new Map<string, { driver: string; car: string; track: string; raceName: string }>();

  for (const [year, races] of Object.entries(DATA_BY_YEAR)) {
    for (const race of races) {
      const winner = race.results.find(r => r.finish === 1);
      if (winner) {
        const trackKey = normalizeTrackName(race.track);
        // Store with multiple keys for fuzzy matching
        jsonWinners.set(`${trackKey}-${year}-${race.race_number}`, {
          driver: winner.driver,
          car: winner.car,
          track: race.track,
          raceName: race.name
        });
        jsonWinners.set(`${trackKey}-${year}`, {
          driver: winner.driver,
          car: winner.car,
          track: race.track,
          raceName: race.name
        });
      }
    }
  }

  // Analyze each win result
  const fixes: Array<{
    result_id: string;
    race_name: string;
    year: number;
    current_driver_id: string;
    current_driver_name: string | null;
    api_driver_name: string | null;
    json_winner: string | null;
    correct_driver_id: string | null;
    correct_driver_name: string | null;
    needs_fix: boolean;
  }> = [];

  // Get current driver names
  const currentDriverIds = [...new Set(winResults?.map(r => r.driver_id) || [])];
  const { data: currentDrivers } = await supabase
    .from('drivers')
    .select('id, name')
    .in('id', currentDriverIds);
  const currentDriverMap = new Map(currentDrivers?.map(d => [d.id, d.name]) || []);

  for (const result of winResults || []) {
    const raceInfo = raceInfoMap.get(result.race_id);
    if (!raceInfo) continue;

    const trackKey = normalizeTrackName(raceInfo.track || raceInfo.name || '');
    const year = raceInfo.year;

    // Try to find JSON winner
    let jsonWinner = jsonWinners.get(`${trackKey}-${year}-${raceInfo.race_number}`);
    if (!jsonWinner) {
      jsonWinner = jsonWinners.get(`${trackKey}-${year}`);
    }
    // Try fuzzy match
    if (!jsonWinner) {
      for (const [key, winner] of jsonWinners.entries()) {
        if (key.includes(trackKey) && key.includes(`${year}`)) {
          jsonWinner = winner;
          break;
        }
      }
    }

    let correctDriverId: string | null = null;
    let correctDriverName: string | null = null;

    if (jsonWinner) {
      const normalizedJsonName = normalizeDriverName(jsonWinner.driver);
      const correctDriver = driverByNormalizedName.get(normalizedJsonName);
      if (correctDriver) {
        correctDriverId = correctDriver.id;
        correctDriverName = correctDriver.name;
      }
    }

    const needsFix = correctDriverId !== null && correctDriverId !== result.driver_id;

    fixes.push({
      result_id: result.id,
      race_name: raceInfo.name,
      year,
      current_driver_id: result.driver_id,
      current_driver_name: currentDriverMap.get(result.driver_id) || null,
      api_driver_name: result.api_driver_name,
      json_winner: jsonWinner?.driver || null,
      correct_driver_id: correctDriverId,
      correct_driver_name: correctDriverName,
      needs_fix: needsFix,
    });
  }

  const needsFixing = fixes.filter(f => f.needs_fix);
  const svgFixes = needsFixing.filter(f => f.correct_driver_name?.toLowerCase().includes('gisbergen'));
  const blaneyFixes = needsFixing.filter(f => f.correct_driver_name?.toLowerCase().includes('blaney'));

  return NextResponse.json({
    summary: {
      total_wins_in_db: winResults?.length || 0,
      wins_analyzed: fixes.length,
      wins_needing_fix: needsFixing.length,
      svg_wins_to_fix: svgFixes.length,
      blaney_wins_to_fix: blaneyFixes.length,
    },
    svg_fixes: svgFixes,
    blaney_fixes: blaneyFixes,
    all_fixes: needsFixing.slice(0, 20),
    instructions: needsFixing.length > 0
      ? 'POST to this endpoint to apply fixes'
      : 'No wins need fixing',
  });
}

export async function POST() {
  const supabase = await createClient();

  // Get all drivers for lookup
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverByNormalizedName = new Map<string, { id: string; name: string }>();
  for (const d of allDrivers || []) {
    driverByNormalizedName.set(normalizeDriverName(d.name), { id: d.id, name: d.name });
  }

  // Get all P1 results
  const { data: winResults } = await supabase
    .from('race_results')
    .select('id, race_id, driver_id, finish_position')
    .eq('finish_position', 1);

  // Get races
  const raceIds = [...new Set(winResults?.map(r => r.race_id) || [])];
  const { data: races } = await supabase
    .from('races')
    .select('id, name, track, race_number, season_id')
    .in('id', raceIds);

  const seasonIds = [...new Set(races?.map(r => r.season_id) || [])];
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year')
    .in('id', seasonIds);

  const seasonYearMap = new Map(seasons?.map(s => [s.id, s.year]) || []);
  const raceInfoMap = new Map(races?.map(r => [r.id, {
    ...r,
    year: seasonYearMap.get(r.season_id) || 0
  }]) || []);

  // Build JSON winner lookup
  const jsonWinners = new Map<string, { driver: string; car: string }>();

  for (const [year, races] of Object.entries(DATA_BY_YEAR)) {
    for (const race of races) {
      const winner = race.results.find(r => r.finish === 1);
      if (winner) {
        const trackKey = normalizeTrackName(race.track);
        jsonWinners.set(`${trackKey}-${year}-${race.race_number}`, {
          driver: winner.driver,
          car: winner.car
        });
        jsonWinners.set(`${trackKey}-${year}`, {
          driver: winner.driver,
          car: winner.car
        });
      }
    }
  }

  let fixed = 0;
  let skipped = 0;
  const fixedDrivers: Record<string, number> = {};

  for (const result of winResults || []) {
    const raceInfo = raceInfoMap.get(result.race_id);
    if (!raceInfo) {
      skipped++;
      continue;
    }

    const trackKey = normalizeTrackName(raceInfo.track || raceInfo.name || '');
    const year = raceInfo.year;

    let jsonWinner = jsonWinners.get(`${trackKey}-${year}-${raceInfo.race_number}`) ||
                     jsonWinners.get(`${trackKey}-${year}`);

    if (!jsonWinner) {
      for (const [key, winner] of jsonWinners.entries()) {
        if (key.includes(trackKey) && key.includes(`${year}`)) {
          jsonWinner = winner;
          break;
        }
      }
    }

    if (!jsonWinner) {
      skipped++;
      continue;
    }

    const normalizedJsonName = normalizeDriverName(jsonWinner.driver);
    const correctDriver = driverByNormalizedName.get(normalizedJsonName);

    if (!correctDriver) {
      skipped++;
      continue;
    }

    if (correctDriver.id !== result.driver_id) {
      const carNumber = parseInt(jsonWinner.car?.replace(/\D/g, '') || '0', 10) || null;

      const { error } = await supabase
        .from('race_results')
        .update({
          driver_id: correctDriver.id,
          api_driver_name: jsonWinner.driver,
          api_car_number: carNumber,
        })
        .eq('id', result.id);

      if (!error) {
        fixed++;
        fixedDrivers[correctDriver.name] = (fixedDrivers[correctDriver.name] || 0) + 1;
      }
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      wins_fixed: fixed,
      wins_skipped: skipped,
    },
    fixed_by_driver: fixedDrivers,
  });
}
