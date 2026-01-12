// Server-side utility to calculate driver tiers
// Extracts the tier calculation logic for use in picks pages

import { SupabaseClient } from '@supabase/supabase-js';

// Position points: 1st=10, 2nd=9, ..., 10th=1, 11th+=0
const POSITION_POINTS: Record<number, number> = {
  1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
  6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
};

// Weight multipliers for races:
// Most recent 30 races: 3x
// Next 30 races: 2x
// Oldest 30 races: 1x
function getWeightForRaceIndex(index: number): number {
  if (index < 30) return 3;
  if (index < 60) return 2;
  return 1;
}

// Calculate fantasy points for a single race result
function calculateFantasyPoints(
  finishPosition: number,
  stage1Winner: boolean,
  stage2Winner: boolean,
  mostLapsLed: boolean
): number {
  let points = POSITION_POINTS[finishPosition] || 0;
  if (stage1Winner) points += 1;
  if (stage2Winner) points += 1;
  if (mostLapsLed) points += 1;
  return points;
}

export interface DriverTierInfo {
  driverId: string;
  driverName: string;
  carNumber: number;
  tier: number;  // 1-6+ for full-time, 0 for part-time
  weightedFantasyPoints: number;
}

// Minimum races in most recent 30 to be considered full-time and tier-eligible
const MIN_RECENT_RACES_FOR_TIER = 15;

/**
 * Calculate driver tiers based on weighted fantasy points.
 * Returns a map of driver_id -> tier number (1, 2, 3, etc. or 0 for part-time)
 */
export async function calculateDriverTiers(
  supabase: SupabaseClient
): Promise<Map<string, number>> {
  // Step 1: Get the 90 most recent races with status = 'final'
  const { data: races, error: racesError } = await supabase
    .from('races')
    .select('id, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  if (racesError || !races || races.length === 0) {
    console.error('Error fetching races for tier calculation:', racesError);
    return new Map();
  }

  const raceIds = races.map(r => r.id);

  // Create a map of race_id to its recency index (0 = most recent)
  const raceIndexMap = new Map<string, number>();
  races.forEach((race, index) => {
    raceIndexMap.set(race.id, index);
  });

  // Step 2: Get ALL race results for these races
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
        most_laps_led,
        api_driver_name
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

  // Step 3: Get all drivers for name lookup
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverMap = new Map<string, { name: string; car_number: number }>();
  for (const driver of drivers || []) {
    driverMap.set(driver.id, {
      name: driver.name,
      car_number: driver.car_number,
    });
  }

  // Step 4: Aggregate stats BY DRIVER NAME
  const statsByName: Record<string, {
    driver_ids: Set<string>;
    driver_name: string;
    weighted_fantasy_points: number;
  }> = {};

  for (const result of allResults) {
    // Get driver name
    let driverName = result.api_driver_name;

    if (!driverName && result.driver_id) {
      const driver = driverMap.get(result.driver_id);
      if (driver) {
        driverName = driver.name;
      }
    }

    if (!driverName) continue;

    // Initialize stats for this driver name if needed
    if (!statsByName[driverName]) {
      statsByName[driverName] = {
        driver_ids: new Set(),
        driver_name: driverName,
        weighted_fantasy_points: 0,
      };
    }

    const stats = statsByName[driverName];

    // Track driver IDs (for multiple car number scenarios)
    if (result.driver_id) {
      stats.driver_ids.add(result.driver_id);
    }

    // Calculate fantasy points for this race
    const raceFantasyPoints = calculateFantasyPoints(
      result.finish_position || 0,
      result.stage_1_winner || false,
      result.stage_2_winner || false,
      result.most_laps_led || false
    );

    // Get weight for this race based on recency
    const raceIndex = raceIndexMap.get(result.race_id) ?? 90;
    const weight = getWeightForRaceIndex(raceIndex);

    stats.weighted_fantasy_points += raceFantasyPoints * weight;
  }

  // Step 5: Count races in the most recent 30 races per driver (for full-time eligibility)
  const recentRaceIds = new Set(races.slice(0, 30).map(r => r.id));

  const recentRaceCountByDriver: Record<string, number> = {};
  for (const result of allResults) {
    const driverName = result.api_driver_name || driverMap.get(result.driver_id)?.name;
    if (!driverName) continue;
    if (recentRaceIds.has(result.race_id)) {
      recentRaceCountByDriver[driverName] = (recentRaceCountByDriver[driverName] || 0) + 1;
    }
  }

  // Sort full-time drivers by weighted fantasy points to assign tiers
  const fullTimeDrivers = Object.values(statsByName)
    .filter(d => (recentRaceCountByDriver[d.driver_name] || 0) >= MIN_RECENT_RACES_FOR_TIER)
    .sort((a, b) => b.weighted_fantasy_points - a.weighted_fantasy_points);

  // Create a map of driver name to tier
  const tierByName = new Map<string, number>();
  fullTimeDrivers.forEach((driver, index) => {
    const tier = Math.floor(index / 6) + 1;
    tierByName.set(driver.driver_name, tier);
  });

  // Create final map of driver_id -> tier
  const tierByDriverId = new Map<string, number>();

  for (const [driverName, stats] of Object.entries(statsByName)) {
    const tier = tierByName.get(driverName) || 0; // 0 for part-time
    for (const driverId of stats.driver_ids) {
      tierByDriverId.set(driverId, tier);
    }
  }

  // Also add any drivers that might not have race results
  for (const [driverId, driver] of driverMap) {
    if (!tierByDriverId.has(driverId)) {
      // Check if their name has a tier assigned
      const tier = tierByName.get(driver.name) || 0;
      tierByDriverId.set(driverId, tier);
    }
  }

  return tierByDriverId;
}

/**
 * Get tier for a specific driver ID
 */
export async function getDriverTier(
  supabase: SupabaseClient,
  driverId: string
): Promise<number> {
  const tiers = await calculateDriverTiers(supabase);
  return tiers.get(driverId) || 0;
}

/**
 * Get tiers for multiple driver IDs
 */
export async function getDriverTiers(
  supabase: SupabaseClient,
  driverIds: string[]
): Promise<Map<string, number>> {
  const allTiers = await calculateDriverTiers(supabase);
  const result = new Map<string, number>();

  for (const driverId of driverIds) {
    result.set(driverId, allTiers.get(driverId) || 0);
  }

  return result;
}
