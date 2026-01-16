import { createClient } from '@/lib/supabase/server';
import DriverRankingsTable, { DriverStats } from './DriverRankingsTable';
import {
  getPositionPoints,
  getStage1BonusPoints,
  getStage2BonusPoints,
  getStage3BonusPoints,
  getLapsLedBonusPoints,
  DEFAULT_SCORING_CONFIG,
} from '@/lib/scoring-config';
import type { ScoringConfig } from '@/types/database';

export const dynamic = 'force-dynamic';

// Weight multipliers for races:
// Most recent 30 races: 3x
// Next 30 races: 2x
// Oldest 30 races: 1x
function getWeightForRaceIndex(index: number): number {
  if (index < 30) return 3;
  if (index < 60) return 2;
  return 1;
}

// Calculate fantasy points for a single race result using scoring config
function calculateFantasyPoints(
  finishPosition: number,
  stage1Winner: boolean,
  stage2Winner: boolean,
  stage3Winner: boolean,
  mostLapsLed: boolean,
  positionPoints: Record<number, number>,
  stage1Bonus: number,
  stage2Bonus: number,
  stage3Bonus: number,
  lapsLedBonus: number
): number {
  let points = positionPoints[finishPosition] || 0;
  if (stage1Winner) points += stage1Bonus;
  if (stage2Winner) points += stage2Bonus;
  if (stage3Winner) points += stage3Bonus;
  if (mostLapsLed) points += lapsLedBonus;
  return points;
}

export default async function DriverRankingsPage() {
  const supabase = await createClient();

  // Get active season's scoring config
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  let scoringConfig: ScoringConfig | null = null;
  if (activeSeason) {
    const { data: config } = await supabase
      .from('scoring_configs')
      .select('*')
      .eq('season_id', activeSeason.id)
      .single();
    scoringConfig = config as ScoringConfig | null;
  }

  // Get scoring values from config (or defaults)
  const positionPoints = getPositionPoints(scoringConfig);
  const stage1Bonus = getStage1BonusPoints(scoringConfig);
  const stage2Bonus = getStage2BonusPoints(scoringConfig);
  const stage3Bonus = getStage3BonusPoints(scoringConfig);
  const lapsLedBonus = getLapsLedBonusPoints(scoringConfig);

  // Step 1: Get the 90 most recent races with status = 'final'
  const { data: races, error: racesError } = await supabase
    .from('races')
    .select('id, name, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  if (racesError) {
    console.error('Error fetching races:', racesError);
    return <ErrorDisplay message="Failed to load races" />;
  }

  if (!races || races.length === 0) {
    return <EmptyState />;
  }

  const raceIds = races.map(r => r.id);
  const racesAnalyzed = races.length;

  // Create a map of race_id to its recency index (0 = most recent)
  const raceIndexMap = new Map<string, number>();
  races.forEach((race, index) => {
    raceIndexMap.set(race.id, index);
  });

  // Step 2: Get ALL race results for these races (paginate to avoid limits)
  let allResults: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pageResults, error: resultsError } = await supabase
      .from('race_results')
      .select(`
        id,
        race_id,
        driver_id,
        finish_position,
        stage_1_winner,
        stage_2_winner,
        stage_3_winner,
        most_laps_led,
        api_driver_name,
        api_car_number
      `)
      .in('race_id', raceIds)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      break;
    }

    if (!pageResults || pageResults.length === 0) {
      break;
    }

    allResults = allResults.concat(pageResults);

    if (pageResults.length < pageSize) {
      break;
    }

    page++;
  }

  // Step 3: Get all drivers for name/team lookup
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name');

  const driverMap = new Map<string, { name: string; car_number: number; team_name: string | null }>();
  for (const driver of drivers || []) {
    driverMap.set(driver.id, {
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name,
    });
  }

  // Step 4: Aggregate stats BY DRIVER NAME (not by driver_id)
  // This consolidates stats for drivers who changed car numbers
  const statsByName: Record<string, {
    driver_name: string;
    car_numbers: Set<number>;
    current_car_number: number;
    team_name: string | null;
    total_finish: number;
    races: number;
    wins: number;
    stage_wins: number;
    laps_led_races: number;
    top_5s: number;
    top_10s: number;
    fantasy_points: number;
    weighted_fantasy_points: number;
    total_weight: number;
  }> = {};

  for (const result of allResults) {
    // Get driver name - prefer api_driver_name, fall back to driver lookup
    let driverName = result.api_driver_name;
    let carNumber = result.api_car_number;
    let teamName: string | null = null;

    if (!driverName && result.driver_id) {
      const driver = driverMap.get(result.driver_id);
      if (driver) {
        driverName = driver.name;
        carNumber = carNumber || driver.car_number;
        teamName = driver.team_name;
      }
    }

    if (!driverName) continue;

    // Initialize stats for this driver name if needed
    if (!statsByName[driverName]) {
      const driver = driverMap.get(result.driver_id);
      statsByName[driverName] = {
        driver_name: driverName,
        car_numbers: new Set(),
        current_car_number: driver?.car_number || carNumber || 0,
        team_name: driver?.team_name || teamName,
        total_finish: 0,
        races: 0,
        wins: 0,
        stage_wins: 0,
        laps_led_races: 0,
        top_5s: 0,
        top_10s: 0,
        fantasy_points: 0,
        weighted_fantasy_points: 0,
        total_weight: 0,
      };
    }

    const stats = statsByName[driverName];

    // Track car numbers used
    if (carNumber) {
      stats.car_numbers.add(carNumber);
    }

    // Calculate fantasy points for this race using current season's scoring config
    const raceFantasyPoints = calculateFantasyPoints(
      result.finish_position || 0,
      result.stage_1_winner || false,
      result.stage_2_winner || false,
      result.stage_3_winner || false,
      result.most_laps_led || false,
      positionPoints,
      stage1Bonus,
      stage2Bonus,
      stage3Bonus,
      lapsLedBonus
    );

    // Get weight for this race based on recency
    const raceIndex = raceIndexMap.get(result.race_id) ?? 90;
    const weight = getWeightForRaceIndex(raceIndex);

    // Count stats
    stats.races += 1;
    stats.total_finish += result.finish_position || 0;
    stats.fantasy_points += raceFantasyPoints;
    stats.weighted_fantasy_points += raceFantasyPoints * weight;
    stats.total_weight += weight;

    if (result.finish_position === 1) stats.wins += 1;
    if (result.finish_position <= 5) stats.top_5s += 1;
    if (result.finish_position <= 10) stats.top_10s += 1;

    if (result.stage_1_winner) stats.stage_wins += 1;
    if (result.stage_2_winner) stats.stage_wins += 1;
    if (result.stage_3_winner) stats.stage_wins += 1;

    if (result.most_laps_led) stats.laps_led_races += 1;
  }

  // Step 5: Count races in the most recent 30 races per driver (for full-time eligibility)
  // Full-time drivers must have at least 15 races in the most recent 30 to be tier-eligible
  const MIN_RECENT_RACES_FOR_TIER = 15;
  const recentRaceIds = new Set(races.slice(0, 30).map(r => r.id));

  const recentRaceCountByDriver: Record<string, number> = {};
  for (const result of allResults) {
    const driverName = result.api_driver_name;
    if (!driverName) continue;
    if (recentRaceIds.has(result.race_id)) {
      recentRaceCountByDriver[driverName] = (recentRaceCountByDriver[driverName] || 0) + 1;
    }
  }

  // Create driver stats without tier
  const driverStatsWithoutTier = Object.values(statsByName)
    .map(stats => ({
      driver_name: stats.driver_name,
      car_numbers: Array.from(stats.car_numbers).sort((a, b) => a - b),
      current_car_number: stats.current_car_number,
      team_name: stats.team_name,
      races: stats.races,
      wins: stats.wins,
      stage_wins: stats.stage_wins,
      laps_led_races: stats.laps_led_races,
      avg_finish: stats.races > 0 ? Math.round((stats.total_finish / stats.races) * 10) / 10 : 0,
      top_5s: stats.top_5s,
      top_10s: stats.top_10s,
      fantasy_points: stats.fantasy_points,
      weighted_fantasy_points: stats.weighted_fantasy_points,
      fantasy_points_per_race: stats.races > 0 ? stats.fantasy_points / stats.races : 0,
      weighted_fantasy_points_per_race: stats.total_weight > 0 ? stats.weighted_fantasy_points / stats.total_weight : 0,
      recent_races: recentRaceCountByDriver[stats.driver_name] || 0,
    }))
    .filter(d => d.races > 0);

  // Sort by weighted fantasy points to assign tiers (6 drivers per tier)
  // Only include full-time drivers (15+ races in most recent 30) for tier assignment
  const fullTimeDrivers = driverStatsWithoutTier
    .filter(d => d.recent_races >= MIN_RECENT_RACES_FOR_TIER)
    .sort((a, b) => b.weighted_fantasy_points - a.weighted_fantasy_points);

  // Create a map of driver name to tier (only for full-time drivers)
  const tierMap = new Map<string, number>();
  fullTimeDrivers.forEach((driver, index) => {
    const tier = Math.floor(index / 6) + 1; // Tier 1 = ranks 1-6, Tier 2 = ranks 7-12, etc.
    tierMap.set(driver.driver_name, tier);
  });

  // Add tier to each driver and sort by default (fantasy points)
  // Part-time drivers get tier 0 (displayed as "-")
  const rankings: DriverStats[] = driverStatsWithoutTier
    .map(driver => ({
      driver_name: driver.driver_name,
      car_numbers: driver.car_numbers,
      current_car_number: driver.current_car_number,
      team_name: driver.team_name,
      races: driver.races,
      wins: driver.wins,
      stage_wins: driver.stage_wins,
      laps_led_races: driver.laps_led_races,
      avg_finish: driver.avg_finish,
      top_5s: driver.top_5s,
      top_10s: driver.top_10s,
      fantasy_points: driver.fantasy_points,
      weighted_fantasy_points: driver.weighted_fantasy_points,
      fantasy_points_per_race: driver.fantasy_points_per_race,
      weighted_fantasy_points_per_race: driver.weighted_fantasy_points_per_race,
      tier: tierMap.get(driver.driver_name) || 0, // 0 = part-time/ineligible
    }))
    .sort((a, b) => {
      // Default sort by fantasy points desc
      return b.fantasy_points - a.fantasy_points;
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
        <p className="text-purple-400 mt-1">
          Statistics from the last {racesAnalyzed} races
        </p>
      </div>

      {/* Rankings Table */}
      <DriverRankingsTable rankings={rankings} />

      {/* Legend */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Column Definitions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-purple-300">
          <div>
            <span className="text-fuchsia-400 font-semibold">Tier:</span> Driver tier based on weighted fantasy points (6 full-time drivers per tier, Tier 1 = best). Full-time = 15+ races in last 30. Part-time drivers show &quot;-&quot;.
          </div>
          <div>
            <span className="text-amber-400 font-semibold">FPts:</span> Total fantasy points (P1=10, P2=9, ... P10=1, +1 per stage win, +1 for most laps led)
          </div>
          <div>
            <span className="text-amber-400 font-semibold">WFPts:</span> Weighted fantasy points (recent 30 races = 3×, next 30 = 2×, oldest 30 = 1×)
          </div>
          <div>
            <span className="text-amber-400 font-semibold">FP/R:</span> Fantasy points per race (total ÷ races)
          </div>
          <div>
            <span className="text-amber-400 font-semibold">WFP/R:</span> Weighted fantasy points per race (weighted total ÷ weighted races)
          </div>
          <div>
            <span className="text-amber-400 font-semibold">Wins:</span> Race victories (P1 finishes)
          </div>
          <div>
            <span className="text-emerald-400 font-semibold">Stage Wins:</span> Stage 1 + Stage 2 wins
          </div>
          <div>
            <span className="text-cyan-400 font-semibold">Laps Led:</span> Races leading most laps
          </div>
          <div>
            <span className="text-white font-semibold">Avg Finish:</span> Average finishing position
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-purple-800/30 text-sm text-purple-400">
          Click any column header to sort. Stats consolidated by driver name across car number changes.
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
        <p className="text-purple-400 mt-1">Statistics from recent races</p>
      </div>
      <div className="glass rounded-xl p-12 text-center">
        <p className="text-purple-300">No race results available yet.</p>
        <p className="text-purple-500 text-sm mt-2">
          Import race results to see driver rankings.
        </p>
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
      </div>
      <div className="glass rounded-xl p-12 text-center border border-red-500/30">
        <p className="text-red-400">{message}</p>
      </div>
    </div>
  );
}
