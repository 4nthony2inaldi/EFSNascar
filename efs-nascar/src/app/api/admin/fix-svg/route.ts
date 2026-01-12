import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Import JSON results data
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

export const dynamic = 'force-dynamic';

/**
 * One-shot fix for SVG (Shane van Gisbergen) points issue.
 *
 * GET: Run the fix and return results
 *
 * This endpoint:
 * 1. Finds SVG's driver record(s)
 * 2. Merges duplicate SVG records if any
 * 3. Backfills api_driver_name from JSON source data
 * 4. Re-links any mismatched results to the correct driver_id
 * 5. Returns SVG's updated point total
 */

interface RaceResult {
  finish: number | null;
  driver: string;
  car: string;
  laps_led: number;
  s1: number | null;
  s2: number | null;
}

interface RaceData {
  season: number;
  race_number: number;
  track: string;
  name: string;
  results: RaceResult[];
}

const RESULTS_DATA: Record<number, RaceData[]> = {
  2024: results2024 as RaceData[],
  2025: results2025 as RaceData[],
};

const POSITION_POINTS: Record<number, number> = {
  1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1
};

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET() {
  const supabase = await createClient();
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    console.log(msg);
  };

  log('=== Fixing SVG Points ===');

  // Step 1: Find SVG's driver record(s)
  log('Step 1: Finding SVG driver record...');
  const { data: svgDrivers, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name')
    .ilike('name', '%gisbergen%');

  if (driverError) {
    return NextResponse.json({ error: 'Error finding driver', details: driverError }, { status: 500 });
  }

  if (!svgDrivers || svgDrivers.length === 0) {
    return NextResponse.json({ error: 'No SVG driver found!' }, { status: 404 });
  }

  log(`Found ${svgDrivers.length} driver records matching "gisbergen":`);
  for (const d of svgDrivers) {
    log(`  - ${d.name} (#${d.car_number}) - ID: ${d.id}`);
  }

  // Step 2: Merge duplicate SVG records if any
  let mergeCount = 0;
  if (svgDrivers.length > 1) {
    log('*** Multiple SVG records found! Merging... ***');

    const keepDriver = svgDrivers[0];
    for (let i = 1; i < svgDrivers.length; i++) {
      const mergeDriver = svgDrivers[i];
      log(`Merging ${mergeDriver.name} (#${mergeDriver.car_number}) into ${keepDriver.name} (#${keepDriver.car_number})`);

      // Update race_results
      await supabase
        .from('race_results')
        .update({ driver_id: keepDriver.id })
        .eq('driver_id', mergeDriver.id);

      // Update picks
      for (const slot of ['driver_1_id', 'driver_2_id', 'driver_3_id']) {
        await supabase
          .from('picks')
          .update({ [slot]: keepDriver.id })
          .eq(slot, mergeDriver.id);
      }

      // Update driver_usage
      await supabase
        .from('driver_usage')
        .update({ driver_id: keepDriver.id })
        .eq('driver_id', mergeDriver.id);

      // Delete the merged driver
      await supabase
        .from('drivers')
        .delete()
        .eq('id', mergeDriver.id);

      mergeCount++;
      log(`  Merged and deleted ${mergeDriver.name}`);
    }
  }

  const svgDriver = svgDrivers[0];
  const svgId = svgDriver.id;
  log(`Using SVG driver: ${svgDriver.name} (#${svgDriver.car_number})`);

  // Step 3: Get all drivers for name matching
  log('Step 2: Building driver name lookup...');
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
  for (const d of allDrivers || []) {
    driverByNormalizedName.set(normalizeDriverName(d.name), d);
  }

  // Step 4: Get seasons
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year')
    .in('year', [2024, 2025]);

  const seasonByYear = new Map<number, string>();
  for (const s of seasons || []) {
    seasonByYear.set(s.year, s.id);
  }

  // Step 5: Process each year
  let totalUpdated = 0;
  let totalRelinked = 0;

  for (const [year, jsonRaces] of Object.entries(RESULTS_DATA)) {
    const yearNum = parseInt(year);
    const seasonId = seasonByYear.get(yearNum);

    if (!seasonId) {
      log(`Skipping year ${year} - no season found`);
      continue;
    }

    log(`Processing ${year}...`);

    // Get races for this season
    const { data: dbRaces } = await supabase
      .from('races')
      .select('id, name, track, race_number')
      .eq('season_id', seasonId);

    // Build track lookup for JSON data
    const jsonByTrack = new Map<string, Map<number, RaceResult>>();
    for (const race of jsonRaces) {
      const trackKey = normalizeTrackName(race.track);
      if (!jsonByTrack.has(trackKey)) {
        jsonByTrack.set(trackKey, new Map());
      }
      for (const result of race.results) {
        if (result.finish) {
          jsonByTrack.get(trackKey)!.set(result.finish, result);
        }
      }
    }

    // Get race results for this season
    const raceIds = (dbRaces || []).map(r => r.id);
    const { data: raceResults } = await supabase
      .from('race_results')
      .select('id, race_id, driver_id, finish_position, api_driver_name')
      .in('race_id', raceIds);

    // Process each result
    for (const result of raceResults || []) {
      const race = dbRaces?.find(r => r.id === result.race_id);
      if (!race) continue;

      const trackKey = normalizeTrackName(race.track || '');

      // Find matching JSON result
      let positionMap = jsonByTrack.get(trackKey);
      if (!positionMap) {
        for (const [jsonTrack, map] of jsonByTrack.entries()) {
          if (jsonTrack.includes(trackKey) || trackKey.includes(jsonTrack)) {
            positionMap = map;
            break;
          }
        }
      }

      if (!positionMap || !result.finish_position) continue;

      const jsonResult = positionMap.get(result.finish_position);
      if (!jsonResult) continue;

      // Update api_driver_name if missing
      if (!result.api_driver_name) {
        const carNumber = parseInt(jsonResult.car?.replace(/\D/g, '') || '0', 10) || null;

        const { error } = await supabase
          .from('race_results')
          .update({
            api_driver_name: jsonResult.driver,
            api_car_number: carNumber,
          })
          .eq('id', result.id);

        if (!error) totalUpdated++;
      }

      // Re-link if driver_id doesn't match the correct driver
      const correctDriver = driverByNormalizedName.get(normalizeDriverName(jsonResult.driver));
      if (correctDriver && correctDriver.id !== result.driver_id) {
        log(`  Re-linking: ${race.name} P${result.finish_position} from ${result.driver_id} to ${correctDriver.name}`);

        const { error } = await supabase
          .from('race_results')
          .update({ driver_id: correctDriver.id })
          .eq('id', result.id);

        if (!error) totalRelinked++;
      }
    }
  }

  log(`Updated api_driver_name: ${totalUpdated} results`);
  log(`Re-linked to correct driver: ${totalRelinked} results`);

  // Step 6: Verify SVG's points
  log('=== Verifying SVG Points ===');

  const { data: finalRaces } = await supabase
    .from('races')
    .select('id')
    .eq('status', 'final');

  const finalRaceIds = new Set((finalRaces || []).map(r => r.id));

  const { data: svgResults } = await supabase
    .from('race_results')
    .select('id, race_id, finish_position, stage_1_winner, stage_2_winner, most_laps_led')
    .eq('driver_id', svgId);

  let totalPoints = 0;
  const pointsBreakdown: Array<{ race_id: string; position: number; points: number }> = [];

  for (const r of svgResults || []) {
    if (!finalRaceIds.has(r.race_id)) continue;

    const posPoints = POSITION_POINTS[r.finish_position] || 0;
    const stagePoints = (r.stage_1_winner ? 1 : 0) + (r.stage_2_winner ? 1 : 0);
    const lapsPoints = r.most_laps_led ? 1 : 0;
    const raceTotal = posPoints + stagePoints + lapsPoints;
    totalPoints += raceTotal;

    if (raceTotal > 0) {
      pointsBreakdown.push({
        race_id: r.race_id,
        position: r.finish_position,
        points: raceTotal,
      });
    }
  }

  log(`SVG Total Points: ${totalPoints}`);

  return NextResponse.json({
    success: true,
    svg_driver: {
      id: svgId,
      name: svgDriver.name,
      car_number: svgDriver.car_number,
    },
    fixes_applied: {
      merged_duplicate_records: mergeCount,
      backfilled_api_names: totalUpdated,
      relinked_results: totalRelinked,
    },
    svg_points: {
      total: totalPoints,
      races_with_points: pointsBreakdown.length,
      breakdown: pointsBreakdown,
    },
    logs,
  });
}
