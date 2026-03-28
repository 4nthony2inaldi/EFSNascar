// TITS (Tier 1 + Tier 2) Remaining and TITS % calculations
// Each driver can be used 4 times, with one bonus 5th use available

import { SupabaseClient } from '@supabase/supabase-js';
import { calculateDriverTiers } from './driverTiers';
import { BASE_DRIVER_USES, DEFAULT_BONUS_USES } from '@/types';

export interface TitsStats {
  t1Remaining: number;  // Tier 1 picks remaining
  t2Remaining: number;  // Tier 2 picks remaining
  titsRemaining: number;  // Total T1 + T2 + bonus remaining
  totalPicksRemaining: number;  // 3 picks × remaining races
  titsPercent: number;  // (titsRemaining / totalPicksRemaining) × 100
  bonusUsed: boolean;  // Whether the bonus 5th use has been consumed
}

export interface TeamTitsStats extends TitsStats {
  teamId: string;
}

/**
 * Calculate TITS stats for a single team
 */
export async function calculateTeamTitsStats(
  supabase: SupabaseClient,
  teamId: string,
  seasonId: string
): Promise<TitsStats> {
  // Get driver tiers
  const driverTiers = await calculateDriverTiers(supabase);

  // Get all drivers
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id')
    .eq('is_active', true);

  // Identify tier 1 and tier 2 driver IDs
  const tier1DriverIds = new Set<string>();
  const tier2DriverIds = new Set<string>();

  for (const driver of allDrivers || []) {
    const tier = driverTiers.get(driver.id) || 0;
    if (tier === 1) tier1DriverIds.add(driver.id);
    if (tier === 2) tier2DriverIds.add(driver.id);
  }

  // Get all picks for this team in the current season to calculate usage
  const { data: picks } = await supabase
    .from('picks')
    .select('driver_1_id, driver_2_id, driver_3_id, race:races!inner(season_id)')
    .eq('team_id', teamId)
    .eq('races.season_id', seasonId);

  // Build usage map
  const usageMap: Record<string, number> = {};
  for (const pick of picks || []) {
    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
      usageMap[driverId] = (usageMap[driverId] || 0) + 1;
    });
  }

  // Get bonus uses for this team
  const { data: bonus } = await supabase
    .from('team_season_bonuses')
    .select('bonus_usages')
    .eq('team_id', teamId)
    .eq('season_id', seasonId)
    .single();

  const bonusUses = bonus?.bonus_usages ?? DEFAULT_BONUS_USES;

  // Calculate T1 remaining (6 drivers × 4 uses each = 24 max)
  let t1Remaining = 0;
  for (const driverId of tier1DriverIds) {
    const used = usageMap[driverId] || 0;
    t1Remaining += Math.max(0, BASE_DRIVER_USES - used);
  }

  // Calculate T2 remaining (6 drivers × 4 uses each = 24 max)
  let t2Remaining = 0;
  for (const driverId of tier2DriverIds) {
    const used = usageMap[driverId] || 0;
    t2Remaining += Math.max(0, BASE_DRIVER_USES - used);
  }

  // Check if bonus has been consumed (any driver used 5+ times)
  let bonusUsed = false;
  for (const used of Object.values(usageMap)) {
    if (used >= BASE_DRIVER_USES + 1) {
      bonusUsed = true;
      break;
    }
  }

  // TITS Remaining = T1 + T2 + bonus (if unused)
  const titsRemaining = t1Remaining + t2Remaining + (bonusUsed ? 0 : bonusUses);

  // Get race counts for TITS %
  const { count: totalRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .neq('race_type', 'exhibition');

  const { count: completedRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .eq('status', 'final')
    .neq('race_type', 'exhibition');

  const remainingRaces = (totalRaces || 0) - (completedRaces || 0);
  const totalPicksRemaining = remainingRaces * 3; // 3 picks per race

  // TITS % = (titsRemaining / totalPicksRemaining) × 100
  const titsPercent = totalPicksRemaining > 0
    ? (titsRemaining / totalPicksRemaining) * 100
    : 0;

  return {
    t1Remaining,
    t2Remaining,
    titsRemaining,
    totalPicksRemaining,
    titsPercent,
    bonusUsed,
  };
}

/**
 * Calculate TITS stats for all teams (optimized batch query)
 * @param revealedOnly - If true, only count picks from races where deadline has passed
 * @param excludeTeamId - Optional team ID to exclude from revealedOnly filter (for showing own team's full stats)
 */
export async function calculateAllTeamsTitsStats(
  supabase: SupabaseClient,
  seasonId: string,
  revealedOnly: boolean = false,
  excludeTeamId?: string
): Promise<Map<string, TitsStats>> {
  const results = new Map<string, TitsStats>();

  // Get driver tiers
  const driverTiers = await calculateDriverTiers(supabase);

  // Get all active drivers
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id')
    .eq('is_active', true);

  // Identify tier 1 and tier 2 driver IDs
  const tier1DriverIds = new Set<string>();
  const tier2DriverIds = new Set<string>();

  for (const driver of allDrivers || []) {
    const tier = driverTiers.get(driver.id) || 0;
    if (tier === 1) tier1DriverIds.add(driver.id);
    if (tier === 2) tier2DriverIds.add(driver.id);
  }

  // Get all teams
  const { data: teams } = await supabase
    .from('teams')
    .select('id');

  // Get revealed races if needed (deadline passed or race completed)
  let revealedRaceIds: Set<string> | null = null;
  if (revealedOnly) {
    const now = new Date().toISOString();
    const { data: revealedRaces } = await supabase
      .from('races')
      .select('id')
      .eq('season_id', seasonId)
      .or(`deadline_datetime.lt.${now},status.eq.in_progress,status.eq.final`);
    revealedRaceIds = new Set((revealedRaces || []).map(r => r.id));
  }

  // Get all picks for the season
  const { data: allPicks } = await supabase
    .from('picks')
    .select('team_id, race_id, driver_1_id, driver_2_id, driver_3_id, race:races!inner(season_id)')
    .eq('races.season_id', seasonId);

  // Build usage map per team (respecting revealedOnly filter)
  const usageByTeam: Record<string, Record<string, number>> = {};
  for (const pick of allPicks || []) {
    // If revealedOnly mode, skip unrevealed picks (unless it's the excluded team's own picks)
    if (revealedOnly && revealedRaceIds && pick.team_id !== excludeTeamId) {
      if (!revealedRaceIds.has(pick.race_id)) {
        continue;
      }
    }

    if (!usageByTeam[pick.team_id]) {
      usageByTeam[pick.team_id] = {};
    }
    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
      usageByTeam[pick.team_id][driverId] = (usageByTeam[pick.team_id][driverId] || 0) + 1;
    });
  }

  // Get all bonus usages
  const { data: bonuses } = await supabase
    .from('team_season_bonuses')
    .select('team_id, bonus_usages')
    .eq('season_id', seasonId);

  const bonusByTeam: Record<string, number> = {};
  for (const bonus of bonuses || []) {
    bonusByTeam[bonus.team_id] = bonus.bonus_usages;
  }

  // Get race counts
  const { count: totalRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .neq('race_type', 'exhibition');

  const { count: completedRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .eq('status', 'final')
    .neq('race_type', 'exhibition');

  const remainingRaces = (totalRaces || 0) - (completedRaces || 0);
  const totalPicksRemaining = remainingRaces * 3;

  // Calculate stats for each team
  for (const team of teams || []) {
    const usageMap = usageByTeam[team.id] || {};
    const bonusUses = bonusByTeam[team.id] ?? DEFAULT_BONUS_USES;

    // Calculate T1 remaining
    let t1Remaining = 0;
    for (const driverId of tier1DriverIds) {
      const used = usageMap[driverId] || 0;
      t1Remaining += Math.max(0, BASE_DRIVER_USES - used);
    }

    // Calculate T2 remaining
    let t2Remaining = 0;
    for (const driverId of tier2DriverIds) {
      const used = usageMap[driverId] || 0;
      t2Remaining += Math.max(0, BASE_DRIVER_USES - used);
    }

    // Check if bonus has been consumed
    let bonusUsed = false;
    for (const used of Object.values(usageMap)) {
      if (used >= BASE_DRIVER_USES + 1) {
        bonusUsed = true;
        break;
      }
    }

    const titsRemaining = t1Remaining + t2Remaining + (bonusUsed ? 0 : bonusUses);
    const titsPercent = totalPicksRemaining > 0
      ? (titsRemaining / totalPicksRemaining) * 100
      : 0;

    results.set(team.id, {
      t1Remaining,
      t2Remaining,
      titsRemaining,
      totalPicksRemaining,
      titsPercent,
      bonusUsed,
    });
  }

  return results;
}
