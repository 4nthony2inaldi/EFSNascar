/**
 * Fix SVG (Shane van Gisbergen) points issue
 *
 * Run with: npx tsx scripts/fix-svg-points.ts
 *
 * This script:
 * 1. Finds SVG's driver record
 * 2. Backfills api_driver_name from JSON source data
 * 3. Re-links any mismatched results to the correct driver_id
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Import JSON results data
import results2024 from '../src/data/results/nascar-results-2024.json';
import results2025 from '../src/data/results/nascar-results-2025.json';

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

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  console.log('=== Fixing SVG Points ===\n');

  // Step 1: Find SVG's driver record
  console.log('Step 1: Finding SVG driver record...');
  const { data: svgDrivers, error: driverError } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name')
    .ilike('name', '%gisbergen%');

  if (driverError) {
    console.error('Error finding driver:', driverError);
    process.exit(1);
  }

  console.log(`Found ${svgDrivers?.length || 0} driver records matching "gisbergen":`);
  for (const d of svgDrivers || []) {
    console.log(`  - ${d.name} (#${d.car_number}) - ID: ${d.id}`);
  }

  if (!svgDrivers || svgDrivers.length === 0) {
    console.error('No SVG driver found!');
    process.exit(1);
  }

  // If multiple SVG records, we need to merge them
  if (svgDrivers.length > 1) {
    console.log('\n*** WARNING: Multiple SVG records found! ***');
    console.log('Merging records...');

    // Keep the first one, merge others into it
    const keepDriver = svgDrivers[0];
    for (let i = 1; i < svgDrivers.length; i++) {
      const mergeDriver = svgDrivers[i];
      console.log(`Merging ${mergeDriver.name} (#${mergeDriver.car_number}) into ${keepDriver.name} (#${keepDriver.car_number})`);

      // Update race_results
      const { error: updateError } = await supabase
        .from('race_results')
        .update({ driver_id: keepDriver.id })
        .eq('driver_id', mergeDriver.id);

      if (updateError) {
        console.error(`  Error updating race_results:`, updateError);
      } else {
        console.log(`  Updated race_results`);
      }

      // Update picks
      for (const slot of ['driver_1_id', 'driver_2_id', 'driver_3_id']) {
        const { error } = await supabase
          .from('picks')
          .update({ [slot]: keepDriver.id })
          .eq(slot, mergeDriver.id);
        if (!error) console.log(`  Updated picks.${slot}`);
      }

      // Delete the merged driver
      const { error: deleteError } = await supabase
        .from('drivers')
        .delete()
        .eq('id', mergeDriver.id);

      if (deleteError) {
        console.error(`  Error deleting merged driver:`, deleteError);
      } else {
        console.log(`  Deleted merged driver record`);
      }
    }
  }

  const svgDriver = svgDrivers[0];
  const svgId = svgDriver.id;
  console.log(`\nUsing SVG driver: ${svgDriver.name} (#${svgDriver.car_number}) - ID: ${svgId}`);

  // Step 2: Get all drivers for name matching
  console.log('\nStep 2: Building driver name lookup...');
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
  for (const d of allDrivers || []) {
    driverByNormalizedName.set(normalizeDriverName(d.name), d);
  }
  console.log(`Loaded ${allDrivers?.length || 0} drivers`);

  // Step 3: Get all seasons
  console.log('\nStep 3: Getting seasons...');
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year')
    .in('year', [2024, 2025]);

  const seasonByYear = new Map<number, string>();
  for (const s of seasons || []) {
    seasonByYear.set(s.year, s.id);
  }
  console.log(`Found seasons: ${Array.from(seasonByYear.keys()).join(', ')}`);

  // Step 4: Process each year
  let totalUpdated = 0;
  let totalRelinked = 0;

  for (const [year, jsonRaces] of Object.entries(RESULTS_DATA)) {
    const yearNum = parseInt(year);
    const seasonId = seasonByYear.get(yearNum);

    if (!seasonId) {
      console.log(`\nSkipping year ${year} - no season found`);
      continue;
    }

    console.log(`\n=== Processing ${year} ===`);

    // Get races for this season
    const { data: dbRaces } = await supabase
      .from('races')
      .select('id, name, track, race_number')
      .eq('season_id', seasonId);

    console.log(`Found ${dbRaces?.length || 0} races in database`);

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

    console.log(`Found ${raceResults?.length || 0} race results`);

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

        if (!error) {
          totalUpdated++;
        }
      }

      // Check if this result should be re-linked
      const correctDriver = driverByNormalizedName.get(normalizeDriverName(jsonResult.driver));
      if (correctDriver && correctDriver.id !== result.driver_id) {
        console.log(`  Re-linking: ${race.name} P${result.finish_position} -> ${correctDriver.name}`);

        const { error } = await supabase
          .from('race_results')
          .update({ driver_id: correctDriver.id })
          .eq('id', result.id);

        if (!error) {
          totalRelinked++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated api_driver_name: ${totalUpdated} results`);
  console.log(`Re-linked to correct driver: ${totalRelinked} results`);

  // Step 5: Verify SVG's points
  console.log('\n=== Verifying SVG Points ===');

  const { data: svgResults } = await supabase
    .from('race_results')
    .select('id, finish_position, stage_1_winner, stage_2_winner, most_laps_led, race:races(name, status)')
    .eq('driver_id', svgId);

  let totalPoints = 0;
  const POSITION_POINTS: Record<number, number> = {
    1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1
  };

  console.log('\nSVG Race Results:');
  for (const r of svgResults || []) {
    const race = r.race as any;
    if (race?.status !== 'final') continue;

    const posPoints = POSITION_POINTS[r.finish_position] || 0;
    const stagePoints = (r.stage_1_winner ? 1 : 0) + (r.stage_2_winner ? 1 : 0);
    const lapsPoints = r.most_laps_led ? 1 : 0;
    const raceTotal = posPoints + stagePoints + lapsPoints;
    totalPoints += raceTotal;

    if (raceTotal > 0) {
      console.log(`  ${race?.name || 'Unknown'}: P${r.finish_position} = ${raceTotal} pts`);
    }
  }

  console.log(`\nSVG Total Points: ${totalPoints}`);
  console.log('\nDone!');
}

main().catch(console.error);
