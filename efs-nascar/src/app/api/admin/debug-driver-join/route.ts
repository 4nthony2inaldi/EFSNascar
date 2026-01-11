import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const driverName = searchParams.get('name') || 'Shane van Gisbergen';

  const supabase = await createClient();

  // Step 1: Get driver record
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('*')
    .ilike('name', `%${driverName}%`)
    .single();

  if (driverError || !driver) {
    return NextResponse.json({ error: 'Driver not found', driverError });
  }

  // Step 2: Check for duplicate drivers with similar names
  const { data: allMatchingDrivers } = await supabase
    .from('drivers')
    .select('*')
    .ilike('name', `%${driverName}%`);

  // Step 3: Get race_results for this driver WITHOUT the join
  const { data: resultsWithoutJoin, error: resultsError } = await supabase
    .from('race_results')
    .select('id, race_id, driver_id, finish_position')
    .eq('driver_id', driver.id)
    .limit(5);

  // Step 4: Get same race_results WITH the driver join
  const { data: resultsWithJoin, error: joinError } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      driver:drivers(id, name, car_number, team_name)
    `)
    .eq('driver_id', driver.id)
    .limit(5);

  // Step 5: Get the last 90 final races
  const { data: finalRaces } = await supabase
    .from('races')
    .select('id')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  const raceIds = finalRaces?.map(r => r.id) || [];

  // Step 6: Get ALL race_results for these races with driver join (what driver-rankings does)
  const { data: allResults, error: allError } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      driver:drivers(id, name, car_number, team_name)
    `)
    .in('race_id', raceIds);

  // Filter to find SVG's results
  const svgResultsInAll = allResults?.filter(r => r.driver_id === driver.id) || [];
  const svgResultsWithNullDriver = svgResultsInAll.filter(r => !r.driver);
  const svgResultsWithValidDriver = svgResultsInAll.filter(r => r.driver);

  // Also check: are there results where driver JOIN works?
  const resultsWithValidDriverJoin = allResults?.filter(r => r.driver !== null) || [];
  const resultsWithNullDriverJoin = allResults?.filter(r => r.driver === null) || [];

  return NextResponse.json({
    driver: {
      id: driver.id,
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name,
    },
    duplicate_drivers: allMatchingDrivers?.length || 0,
    all_matching_drivers: allMatchingDrivers,

    // Direct query results
    results_without_join: {
      count: resultsWithoutJoin?.length || 0,
      error: resultsError,
      sample: resultsWithoutJoin?.slice(0, 3),
    },

    // Same results with join
    results_with_join: {
      count: resultsWithJoin?.length || 0,
      error: joinError,
      sample: resultsWithJoin?.slice(0, 3),
    },

    // Full query (what driver-rankings does)
    full_query: {
      total_results: allResults?.length || 0,
      error: allError,
      results_with_valid_driver_join: resultsWithValidDriverJoin.length,
      results_with_null_driver_join: resultsWithNullDriverJoin.length,
    },

    // SVG specific in the full query
    svg_in_full_query: {
      total_svg_results: svgResultsInAll.length,
      svg_with_valid_driver: svgResultsWithValidDriver.length,
      svg_with_null_driver: svgResultsWithNullDriver.length,
      sample_svg_results: svgResultsInAll.slice(0, 3),
    },
  });
}
