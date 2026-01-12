import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { POSITION_POINTS } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint to diagnose driver rankings calculation issues.
 * Specifically investigates why a driver's points might not be showing correctly.
 */

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const driverName = url.searchParams.get('driver') || 'gisbergen';

  // Step 1: Find the driver
  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .ilike('name', `%${driverName}%`);

  if (!drivers || drivers.length === 0) {
    return NextResponse.json({ error: `No driver found matching "${driverName}"` }, { status: 404 });
  }

  const driver = drivers[0];

  // Step 2: Get all race results for this driver
  const { data: allResults } = await supabase
    .from('race_results')
    .select('*')
    .eq('driver_id', driver.id);

  // Step 3: Get the races query (same as rankings page)
  const { data: recentRaces } = await supabase
    .from('races')
    .select('id, name, scheduled_datetime, status')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  const recentRaceIds = new Set(recentRaces?.map(r => r.id) || []);

  // Step 4: Check which of the driver's results are in recent races
  const resultsInRecentRaces = (allResults || []).filter(r => recentRaceIds.has(r.race_id));
  const resultsNotInRecentRaces = (allResults || []).filter(r => !recentRaceIds.has(r.race_id));

  // Step 5: Get race info for results NOT in recent races
  const missingRaceIds = resultsNotInRecentRaces.map(r => r.race_id);
  const { data: missingRaces } = await supabase
    .from('races')
    .select('id, name, scheduled_datetime, status')
    .in('id', missingRaceIds);

  // Step 6: Calculate expected points
  let expectedPoints = 0;
  let expectedWins = 0;
  let expectedLapsLed = 0;

  for (const result of allResults || []) {
    expectedPoints += POSITION_POINTS[result.finish_position] || 0;
    if (result.stage_1_winner) expectedPoints += 1;
    if (result.stage_2_winner) expectedPoints += 1;
    if (result.most_laps_led) {
      expectedPoints += 1;
      expectedLapsLed += 1;
    }
    if (result.finish_position === 1) expectedWins += 1;
  }

  // Step 7: Calculate points only from recent races (what rankings page shows)
  let recentRacesPoints = 0;
  let recentRacesWins = 0;

  for (const result of resultsInRecentRaces) {
    recentRacesPoints += POSITION_POINTS[result.finish_position] || 0;
    if (result.stage_1_winner) recentRacesPoints += 1;
    if (result.stage_2_winner) recentRacesPoints += 1;
    if (result.most_laps_led) recentRacesPoints += 1;
    if (result.finish_position === 1) recentRacesWins += 1;
  }

  // Step 8: Check for any race_id mismatches
  const { data: allRaces } = await supabase
    .from('races')
    .select('id')
    .eq('status', 'final');

  const allFinalRaceIds = new Set(allRaces?.map(r => r.id) || []);
  const orphanedResults = (allResults || []).filter(r => !allFinalRaceIds.has(r.race_id));

  return NextResponse.json({
    driver: {
      id: driver.id,
      name: driver.name,
      car_number: driver.car_number,
    },
    total_results: allResults?.length || 0,
    expected_total_points: expectedPoints,
    expected_wins: expectedWins,
    expected_laps_led_bonuses: expectedLapsLed,

    rankings_query: {
      total_final_races_in_db: allRaces?.length || 0,
      races_used_in_rankings: recentRaces?.length || 0,
      driver_results_in_rankings_races: resultsInRecentRaces.length,
      driver_results_outside_rankings_races: resultsNotInRecentRaces.length,
      points_from_rankings_races: recentRacesPoints,
      wins_from_rankings_races: recentRacesWins,
    },

    diagnosis: {
      orphaned_results_count: orphanedResults.length,
      orphaned_results: orphanedResults.length > 0 ? orphanedResults.slice(0, 5) : [],
      missing_races_info: missingRaces?.slice(0, 10) || [],
      issue: resultsNotInRecentRaces.length > 0
        ? `${resultsNotInRecentRaces.length} results are linked to races not in the top 90 most recent final races`
        : orphanedResults.length > 0
        ? `${orphanedResults.length} results are linked to races that aren't marked as final`
        : 'No obvious issue found - results should be showing correctly',
    },

    sample_recent_races: recentRaces?.slice(0, 5),
    sample_driver_results: (allResults || []).slice(0, 5).map(r => ({
      race_id: r.race_id,
      finish_position: r.finish_position,
      most_laps_led: r.most_laps_led,
      in_recent_races: recentRaceIds.has(r.race_id),
    })),
  });
}
