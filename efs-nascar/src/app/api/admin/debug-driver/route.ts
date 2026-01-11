import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const driverName = searchParams.get('name') || 'Shane van Gisbergen';

  const supabase = await createClient();

  // Get driver record
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('*')
    .ilike('name', `%${driverName}%`)
    .single();

  if (driverError || !driver) {
    return NextResponse.json({ error: 'Driver not found', driverError });
  }

  // Get all race_results for this driver
  const { data: allResults, error: resultsError } = await supabase
    .from('race_results')
    .select(`
      *,
      race:races(id, race_number, name, track, status, scheduled_datetime, season_id)
    `)
    .eq('driver_id', driver.id)
    .order('created_at', { ascending: false });

  // Get the last 90 races with status='final'
  const { data: finalRaces } = await supabase
    .from('races')
    .select('id, race_number, name, track, status, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  // Check which of the driver's results are in the final races
  const finalRaceIds = new Set(finalRaces?.map(r => r.id) || []);
  const resultsInFinalRaces = allResults?.filter(r => finalRaceIds.has(r.race_id)) || [];
  const resultsNotInFinalRaces = allResults?.filter(r => !finalRaceIds.has(r.race_id)) || [];

  // Calculate what points should be
  let expectedPoints = 0;
  const pointsBreakdown: any[] = [];

  for (const result of resultsInFinalRaces) {
    const posPoints = result.finish_position <= 10 ? 11 - result.finish_position : 0;
    const stagePoints = (result.stage_1_winner ? 1 : 0) + (result.stage_2_winner ? 1 : 0);
    const lapsLedPoints = result.most_laps_led ? 1 : 0;
    const totalForRace = posPoints + stagePoints + lapsLedPoints;

    expectedPoints += totalForRace;

    if (totalForRace > 0 || result.finish_position <= 10) {
      pointsBreakdown.push({
        race: result.race?.name || 'Unknown',
        track: result.race?.track || 'Unknown',
        finish_position: result.finish_position,
        position_points: posPoints,
        stage_1_winner: result.stage_1_winner,
        stage_2_winner: result.stage_2_winner,
        most_laps_led: result.most_laps_led,
        total: totalForRace,
      });
    }
  }

  return NextResponse.json({
    driver: {
      id: driver.id,
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name,
    },
    total_results: allResults?.length || 0,
    results_in_final_races: resultsInFinalRaces.length,
    results_not_in_final_races: resultsNotInFinalRaces.length,
    expected_points: expectedPoints,
    points_breakdown: pointsBreakdown,
    races_not_final: resultsNotInFinalRaces.map(r => ({
      race_id: r.race_id,
      race_name: r.race?.name,
      race_track: r.race?.track,
      race_status: r.race?.status,
      finish_position: r.finish_position,
    })),
    total_final_races_in_db: finalRaces?.length || 0,
  });
}
