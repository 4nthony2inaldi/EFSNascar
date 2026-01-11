import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { POSITION_POINTS } from '@/types';

// Weights for recency tiers (most recent 30, middle 30, oldest 30)
const TIER_WEIGHTS = {
  recent: 3,   // Races 1-30 (most recent)
  middle: 2,   // Races 31-60
  oldest: 1,   // Races 61-90
};

export interface DriverRanking {
  driver_id: string;
  driver_name: string;
  car_number: number;
  team_name: string | null;
  is_active: boolean;
  total_points: number;
  weighted_score: number;
  weighted_per_race: number;
  position_points: number;
  stage_wins: number;
  stage_points: number;
  laps_led_bonuses: number;
  races_counted: number;
  avg_finish: number;
  wins: number;
  top_5s: number;
  top_10s: number;
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the last 90 races that have results (status = 'final')
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, scheduled_datetime')
      .eq('status', 'final')
      .order('scheduled_datetime', { ascending: false })
      .limit(90);

    if (racesError) {
      console.error('Error fetching races:', racesError);
      return NextResponse.json({ error: 'Failed to fetch races' }, { status: 500 });
    }

    if (!races || races.length === 0) {
      return NextResponse.json({
        rankings: [],
        races_analyzed: 0,
        message: 'No completed races found'
      });
    }

    // Create a map of race_id to tier weight based on recency
    const raceWeights: Record<string, number> = {};
    races.forEach((race, index) => {
      if (index < 30) {
        raceWeights[race.id] = TIER_WEIGHTS.recent;
      } else if (index < 60) {
        raceWeights[race.id] = TIER_WEIGHTS.middle;
      } else {
        raceWeights[race.id] = TIER_WEIGHTS.oldest;
      }
    });

    const raceIds = races.map(r => r.id);

    // Get all results for these races (without join - more reliable)
    // Note: Must set limit higher than default 1000 to get all results (90 races * ~40 drivers = ~3600)
    const { data: results, error: resultsError } = await supabase
      .from('race_results')
      .select('*')
      .in('race_id', raceIds)
      .limit(5000);

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      return NextResponse.json({ error: 'Failed to fetch race results' }, { status: 500 });
    }

    // Get all drivers separately
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, name, car_number, team_name, is_active');

    if (driversError) {
      console.error('Error fetching drivers:', driversError);
      return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
    }

    // Create a map of driver_id to driver info
    const driverMap: Record<string, {
      id: string;
      name: string;
      car_number: number;
      team_name: string | null;
      is_active: boolean;
    }> = {};
    for (const driver of drivers || []) {
      driverMap[driver.id] = driver;
    }

    // Aggregate driver stats
    const driverStats: Record<string, {
      driver_id: string;
      driver_name: string;
      car_number: number;
      team_name: string | null;
      is_active: boolean;
      total_position_points: number;
      weighted_position_points: number;
      stage_wins: number;
      weighted_stage_points: number;
      laps_led_bonuses: number;
      weighted_laps_led: number;
      races_counted: number;
      total_finish_position: number;
      wins: number;
      top_5s: number;
      top_10s: number;
    }> = {};

    for (const result of results || []) {
      const driver = driverMap[result.driver_id];
      if (!driver) continue;

      const weight = raceWeights[result.race_id] || 1;

      if (!driverStats[driver.id]) {
        driverStats[driver.id] = {
          driver_id: driver.id,
          driver_name: driver.name,
          car_number: driver.car_number,
          team_name: driver.team_name,
          is_active: driver.is_active,
          total_position_points: 0,
          weighted_position_points: 0,
          stage_wins: 0,
          weighted_stage_points: 0,
          laps_led_bonuses: 0,
          weighted_laps_led: 0,
          races_counted: 0,
          total_finish_position: 0,
          wins: 0,
          top_5s: 0,
          top_10s: 0,
        };
      }

      const stats = driverStats[driver.id];

      // Position points
      const posPoints = POSITION_POINTS[result.finish_position] || 0;
      stats.total_position_points += posPoints;
      stats.weighted_position_points += posPoints * weight;

      // Stage wins
      if (result.stage_1_winner) {
        stats.stage_wins += 1;
        stats.weighted_stage_points += 1 * weight;
      }
      if (result.stage_2_winner) {
        stats.stage_wins += 1;
        stats.weighted_stage_points += 1 * weight;
      }

      // Most laps led bonus
      if (result.most_laps_led) {
        stats.laps_led_bonuses += 1;
        stats.weighted_laps_led += 1 * weight;
      }

      // Race count and finish position for average
      stats.races_counted += 1;
      stats.total_finish_position += result.finish_position;

      // Wins, top 5s, top 10s
      if (result.finish_position === 1) stats.wins += 1;
      if (result.finish_position <= 5) stats.top_5s += 1;
      if (result.finish_position <= 10) stats.top_10s += 1;
    }

    // Convert to rankings array with calculated totals
    const rankings: DriverRanking[] = Object.values(driverStats).map(stats => {
      const totalPoints = stats.total_position_points + stats.stage_wins + stats.laps_led_bonuses;
      const weightedScore = stats.weighted_position_points + stats.weighted_stage_points + stats.weighted_laps_led;
      const weightedPerRace = stats.races_counted > 0
        ? Math.round((weightedScore / stats.races_counted) * 100) / 100
        : 0;

      return {
        driver_id: stats.driver_id,
        driver_name: stats.driver_name,
        car_number: stats.car_number,
        team_name: stats.team_name,
        is_active: stats.is_active,
        position_points: stats.total_position_points,
        stage_wins: stats.stage_wins,
        stage_points: stats.stage_wins,
        laps_led_bonuses: stats.laps_led_bonuses,
        total_points: totalPoints,
        weighted_score: weightedScore,
        weighted_per_race: weightedPerRace,
        races_counted: stats.races_counted,
        avg_finish: stats.races_counted > 0
          ? Math.round((stats.total_finish_position / stats.races_counted) * 10) / 10
          : 0,
        wins: stats.wins,
        top_5s: stats.top_5s,
        top_10s: stats.top_10s,
      };
    });

    // Sort by total points descending
    rankings.sort((a, b) => b.total_points - a.total_points);

    return NextResponse.json({
      rankings,
      races_analyzed: races.length,
      tier_weights: TIER_WEIGHTS,
    });
  } catch (error: unknown) {
    console.error('Error calculating driver rankings:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
