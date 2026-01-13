import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile, Driver, Season, Race } from '@/types';
import { calculateTeamTitsStats } from '@/lib/titsCalculation';
import { SeasonSelector, SEASON_COOKIE_NAME } from '@/components/SeasonSelector';
import { PickStrategyBadge } from '@/components/PickStrategyBadge';
import { DriverUsageTable } from '@/components/DriverUsageTable';
import { calculateDriverTiers } from '@/lib/driverTiers';
import { getPickStrategy } from '@/lib/pickStrategy';

// Force dynamic rendering to ensure cookies are read fresh
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

export default async function TeamProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Get team with members and favorite driver
  const { data: team, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_memberships(
        *,
        profile:profiles(*)
      ),
      favorite_driver:drivers(*)
    `)
    .eq('id', id)
    .single();

  if (error || !team) {
    notFound();
  }

  // Check if current user is an owner of this team
  const isOwner = team.team_memberships?.some(
    (m: TeamMembership & { profile: Profile }) =>
      m.user_id === user?.id && m.role === 'owner'
  );

  // Get all seasons for the selector
  const { data: allSeasons } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false });

  const seasons = (allSeasons || []) as Season[];

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Determine which season to display (from URL param, then cookie, then default to active)
  const seasonCookie = cookieStore.get(SEASON_COOKIE_NAME)?.value;
  const selectedSeasonId = seasonParam || seasonCookie || activeSeason?.id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || activeSeason;

  // Get team's standings
  const { data: standing } = await supabase
    .from('standings')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', selectedSeasonId)
    .is('race_id', null)
    .single();

  // Get team's bonus usages
  const { data: bonus } = await supabase
    .from('team_season_bonuses')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', selectedSeasonId)
    .single();

  // Get all races for selected season with track info
  const { data: racesData } = await supabase
    .from('races')
    .select('*, track_info:tracks(*)')
    .eq('season_id', selectedSeasonId)
    .order('race_number', { ascending: true });

  const races = (racesData || []) as (Race & { track_info: { track_type: string } | null })[];

  // Get all tracks for fallback lookup (for older seasons without track_id)
  const { data: allTracksData } = await supabase
    .from('tracks')
    .select('name, track_type');

  const trackTypeByName = new Map<string, string>();
  for (const track of allTracksData || []) {
    if (track.name && track.track_type) {
      trackTypeByName.set(track.name, track.track_type);
    }
  }

  // Get all picks for this team in selected season
  const { data: picksData } = await supabase
    .from('picks')
    .select(`
      *,
      driver_1:drivers!picks_driver_1_id_fkey(*),
      driver_2:drivers!picks_driver_2_id_fkey(*),
      driver_3:drivers!picks_driver_3_id_fkey(*)
    `)
    .eq('team_id', id)
    .in('race_id', races.map(r => r.id));

  // Get ALL picks for ALL teams in selected season (for popularity and league average calculations)
  const { data: allPicksData } = await supabase
    .from('picks')
    .select('race_id, driver_1_id, driver_2_id, driver_3_id, team_id')
    .in('race_id', races.map(r => r.id));

  // Get expanded picks for all teams (for league-wide strategy calculation)
  const { data: allPicksExpandedData } = await supabase
    .from('picks')
    .select(`
      *,
      driver_1:drivers!picks_driver_1_id_fkey(*),
      driver_2:drivers!picks_driver_2_id_fkey(*),
      driver_3:drivers!picks_driver_3_id_fkey(*)
    `)
    .in('race_id', races.map(r => r.id));

  // Get all race results for the selected season
  const { data: raceResultsData } = await supabase
    .from('race_results')
    .select('*')
    .in('race_id', races.map(r => r.id));

  // Build lookup maps
  const picksByRaceId = new Map<string, any>();
  for (const pick of picksData || []) {
    picksByRaceId.set(pick.race_id, pick);
  }

  const resultsByRaceAndDriver = new Map<string, any>();
  for (const result of raceResultsData || []) {
    const key = `${result.race_id}-${result.driver_id}`;
    resultsByRaceAndDriver.set(key, result);
  }

  // Calculate driver tiers for pit strategy
  const driverTiers = await calculateDriverTiers(supabase);

  // Position points lookup
  const POSITION_POINTS: Record<number, number> = {
    1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
  };

  // Calculate driver usage from picks (not driver_usages table)
  // This calculates: times used, total points, avg points, and max potential
  interface CalculatedDriverUsage {
    driver: Driver;
    driverId: string;
    timesUsed: number;
    totalPoints: number;
    avgPoints: number;
    maxPotential: number;
    racesUsed: { raceId: string; points: number }[];
  }

  const driverUsageMap = new Map<string, CalculatedDriverUsage>();

  // First, calculate all race results for each driver (for max potential calculation)
  const driverAllRacePoints = new Map<string, number[]>();
  for (const result of raceResultsData || []) {
    const points = POSITION_POINTS[result.finish_position] || 0;
    // Add stage and laps led bonuses for this driver
    let bonusPoints = 0;
    if (result.stage_1_winner) bonusPoints += 1;
    if (result.stage_2_winner) bonusPoints += 1;
    // Note: laps led bonus is team-level (only 1 per team), but for max potential we include it
    if (result.most_laps_led) bonusPoints += 1;

    const totalDriverPoints = points + bonusPoints;

    if (!driverAllRacePoints.has(result.driver_id)) {
      driverAllRacePoints.set(result.driver_id, []);
    }
    driverAllRacePoints.get(result.driver_id)!.push(totalDriverPoints);
  }

  // Now aggregate from picks
  for (const pick of picksData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const driversList = [
      { driver: pick.driver_1 as Driver, id: pick.driver_1_id },
      { driver: pick.driver_2 as Driver, id: pick.driver_2_id },
      { driver: pick.driver_3 as Driver, id: pick.driver_3_id },
    ];

    for (const { driver, id } of driversList) {
      if (!driver || !id) continue;

      const resultKey = `${pick.race_id}-${id}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      let points = 0;
      if (result) {
        points = POSITION_POINTS[result.finish_position] || 0;
        // Add stage wins
        if (result.stage_1_winner) points += 1;
        if (result.stage_2_winner) points += 1;
        // Add laps led (individual driver contribution)
        if (result.most_laps_led) points += 1;
      }

      if (!driverUsageMap.has(id)) {
        driverUsageMap.set(id, {
          driver,
          driverId: id,
          timesUsed: 0,
          totalPoints: 0,
          avgPoints: 0,
          maxPotential: 0,
          racesUsed: [],
        });
      }

      const usage = driverUsageMap.get(id)!;
      usage.timesUsed += 1;
      usage.totalPoints += points;
      usage.racesUsed.push({ raceId: pick.race_id, points });
    }
  }

  // Calculate averages and max potential for each driver
  for (const usage of driverUsageMap.values()) {
    usage.avgPoints = usage.timesUsed > 0
      ? Math.round((usage.totalPoints / usage.timesUsed) * 10) / 10
      : 0;

    // Max potential: their X best races (where X = times used)
    const allPoints = driverAllRacePoints.get(usage.driverId) || [];
    const sortedPoints = [...allPoints].sort((a, b) => b - a);
    const bestRaces = sortedPoints.slice(0, usage.timesUsed);
    usage.maxPotential = bestRaces.reduce((sum, pts) => sum + pts, 0);
  }

  // Convert to sorted array
  const calculatedDriverUsages = Array.from(driverUsageMap.values())
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Calculate points for each race
  interface RacePickData {
    race: Race & { track_info: { track_type: string } | null };
    pick: any | null;
    drivers: {
      driver: Driver;
      points: number;
      position: number | null;
      stageWins: number;
      lapsLed: boolean;
    }[];
    totalPoints: number;
    stageBonus: number;
    lapsLedBonus: number;
    top10Bonus: number;
    strategy: ReturnType<typeof getPickStrategy> | null;
    trackType: string | null;
  }

  const racePicksData: RacePickData[] = races
    .filter(race => race.status === 'final' || picksByRaceId.has(race.id))
    .map(race => {
      const pick = picksByRaceId.get(race.id);

      if (!pick) {
        return {
          race,
          pick: null,
          drivers: [],
          totalPoints: 0,
          stageBonus: 0,
          lapsLedBonus: 0,
          top10Bonus: 0,
          strategy: null,
          trackType: race.track_info?.track_type || trackTypeByName.get(race.track) || null,
        };
      }

      const driversList = [
        { driver: pick.driver_1, id: pick.driver_1_id },
        { driver: pick.driver_2, id: pick.driver_2_id },
        { driver: pick.driver_3, id: pick.driver_3_id },
      ];

      let totalPoints = 0;
      let stageBonus = 0;
      let lapsLedBonus = 0;
      let allTop10 = true;

      const drivers = driversList.map(({ driver, id }) => {
        const resultKey = `${race.id}-${id}`;
        const result = resultsByRaceAndDriver.get(resultKey);

        let points = 0;
        let position: number | null = null;
        let stageWins = 0;
        let lapsLed = false;

        if (result) {
          position = result.finish_position;
          points = POSITION_POINTS[result.finish_position] || 0;

          if (result.stage_1_winner) {
            stageWins++;
            stageBonus++;
          }
          if (result.stage_2_winner) {
            stageWins++;
            stageBonus++;
          }
          if (result.most_laps_led) {
            lapsLed = true;
            if (lapsLedBonus === 0) {
              lapsLedBonus = 1;
            }
          }
          if (result.finish_position > 10) {
            allTop10 = false;
          }
        } else {
          allTop10 = false;
        }

        totalPoints += points;

        return {
          driver,
          points,
          position,
          stageWins,
          lapsLed,
        };
      });

      const top10Bonus = allTop10 && race.status === 'final' ? 1 : 0;
      totalPoints += stageBonus + lapsLedBonus + top10Bonus;

      // Calculate pit strategy
      const tierValues = driversList.map(({ id }) => driverTiers.get(id) || 3);
      const strategy = getPickStrategy(tierValues);

      return {
        race,
        pick,
        drivers,
        totalPoints,
        stageBonus,
        lapsLedBonus,
        top10Bonus,
        strategy,
        trackType: race.track_info?.track_type || trackTypeByName.get(race.track) || null,
      };
    });

  // Calculate average points by pick strategy
  const strategyStats: Record<string, { totalPoints: number; count: number }> = {};
  for (const raceData of racePicksData) {
    if (raceData.race.status === 'final' && raceData.strategy && raceData.pick) {
      const strategyLabel = raceData.strategy.label;
      if (!strategyStats[strategyLabel]) {
        strategyStats[strategyLabel] = { totalPoints: 0, count: 0 };
      }
      strategyStats[strategyLabel].totalPoints += raceData.totalPoints;
      strategyStats[strategyLabel].count += 1;
    }
  }

  // Calculate LEAGUE-WIDE strategy stats (all teams)
  const leagueStrategyStats: Record<string, { totalPoints: number; count: number }> = {};

  for (const pick of allPicksExpandedData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const driversList = [
      { driver: pick.driver_1, id: pick.driver_1_id },
      { driver: pick.driver_2, id: pick.driver_2_id },
      { driver: pick.driver_3, id: pick.driver_3_id },
    ];

    // Calculate total points for this pick
    let totalPoints = 0;
    let stageBonus = 0;
    let lapsLedBonus = 0;
    let allTop10 = true;

    for (const { id } of driversList) {
      const resultKey = `${race.id}-${id}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      if (result) {
        totalPoints += POSITION_POINTS[result.finish_position] || 0;
        if (result.stage_1_winner) stageBonus++;
        if (result.stage_2_winner) stageBonus++;
        if (result.most_laps_led && lapsLedBonus === 0) lapsLedBonus = 1;
        if (result.finish_position > 10) allTop10 = false;
      } else {
        allTop10 = false;
      }
    }

    const top10Bonus = allTop10 ? 1 : 0;
    totalPoints += stageBonus + lapsLedBonus + top10Bonus;

    // Calculate strategy
    const tierValues = driversList.map(({ id }) => driverTiers.get(id) || 3);
    const strategy = getPickStrategy(tierValues);

    if (strategy) {
      if (!leagueStrategyStats[strategy.label]) {
        leagueStrategyStats[strategy.label] = { totalPoints: 0, count: 0 };
      }
      leagueStrategyStats[strategy.label].totalPoints += totalPoints;
      leagueStrategyStats[strategy.label].count += 1;
    }
  }

  const leagueStrategyAverages: Record<string, number> = {};
  for (const [name, stats] of Object.entries(leagueStrategyStats)) {
    leagueStrategyAverages[name] = stats.count > 0
      ? Math.round((stats.totalPoints / stats.count) * 10) / 10
      : 0;
  }

  const strategyAverages = Object.entries(strategyStats)
    .map(([name, stats]) => ({
      name,
      avgPoints: stats.count > 0 ? Math.round((stats.totalPoints / stats.count) * 10) / 10 : 0,
      totalPoints: stats.totalPoints,
      raceCount: stats.count,
      leagueAvg: leagueStrategyAverages[name] || 0,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints);

  // Calculate pick popularity stats for this team
  // Helper to get popularity level
  const getPopularityLevel = (count: number, totalTeams: number): string => {
    const percentage = (count / totalTeams) * 100;
    if (count === 1) return 'unique';
    if (percentage <= 20) return 'rare';
    if (percentage <= 35) return 'uncommon';
    if (percentage <= 50) return 'common';
    if (percentage <= 70) return 'popular';
    return 'chalk';
  };

  // Build driver pick counts per race
  const driverPickCountsByRace: Record<string, Record<string, number>> = {};
  const teamCountByRace: Record<string, number> = {};

  for (const pick of allPicksData || []) {
    if (!driverPickCountsByRace[pick.race_id]) {
      driverPickCountsByRace[pick.race_id] = {};
      teamCountByRace[pick.race_id] = 0;
    }
    teamCountByRace[pick.race_id]++;

    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach(driverId => {
      if (!driverPickCountsByRace[pick.race_id][driverId]) {
        driverPickCountsByRace[pick.race_id][driverId] = 0;
      }
      driverPickCountsByRace[pick.race_id][driverId]++;
    });
  }

  // Calculate points by popularity level for this team
  const popularityStats: Record<string, { totalPoints: number; count: number }> = {
    unique: { totalPoints: 0, count: 0 },
    rare: { totalPoints: 0, count: 0 },
    uncommon: { totalPoints: 0, count: 0 },
    common: { totalPoints: 0, count: 0 },
    popular: { totalPoints: 0, count: 0 },
    chalk: { totalPoints: 0, count: 0 },
  };

  for (const pick of picksData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const totalTeams = teamCountByRace[pick.race_id] || 1;
    const driverCounts = driverPickCountsByRace[pick.race_id] || {};

    const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];

    for (const driverId of driverIds) {
      const resultKey = `${pick.race_id}-${driverId}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      let points = 0;
      if (result) {
        points = POSITION_POINTS[result.finish_position] || 0;
        if (result.stage_1_winner) points += 1;
        if (result.stage_2_winner) points += 1;
        if (result.most_laps_led) points += 1;
      }

      const pickCount = driverCounts[driverId] || 1;
      const popularity = getPopularityLevel(pickCount, totalTeams);

      popularityStats[popularity].totalPoints += points;
      popularityStats[popularity].count += 1;
    }
  }

  const popularityLabels: Record<string, string> = {
    unique: 'Unique',
    rare: 'Rare',
    uncommon: 'Uncommon',
    common: 'Common',
    popular: 'Popular',
    chalk: 'Chalk',
  };

  const popularityColors: Record<string, string> = {
    unique: 'bg-green-800/40 text-green-300 border-green-700/50',
    rare: 'bg-green-500/30 text-green-300 border-green-400/50',
    uncommon: 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50',
    common: 'bg-orange-500/30 text-orange-300 border-orange-500/50',
    popular: 'bg-red-400/30 text-red-300 border-red-400/50',
    chalk: 'bg-red-700/40 text-red-300 border-red-700/50',
  };

  // Calculate LEAGUE-WIDE popularity stats (all teams)
  const leaguePopularityStats: Record<string, { totalPoints: number; count: number }> = {
    unique: { totalPoints: 0, count: 0 },
    rare: { totalPoints: 0, count: 0 },
    uncommon: { totalPoints: 0, count: 0 },
    common: { totalPoints: 0, count: 0 },
    popular: { totalPoints: 0, count: 0 },
    chalk: { totalPoints: 0, count: 0 },
  };

  for (const pick of allPicksData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const totalTeams = teamCountByRace[pick.race_id] || 1;
    const driverCounts = driverPickCountsByRace[pick.race_id] || {};

    const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];

    for (const driverId of driverIds) {
      const resultKey = `${pick.race_id}-${driverId}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      let points = 0;
      if (result) {
        points = POSITION_POINTS[result.finish_position] || 0;
        if (result.stage_1_winner) points += 1;
        if (result.stage_2_winner) points += 1;
        if (result.most_laps_led) points += 1;
      }

      const pickCount = driverCounts[driverId] || 1;
      const popularity = getPopularityLevel(pickCount, totalTeams);

      leaguePopularityStats[popularity].totalPoints += points;
      leaguePopularityStats[popularity].count += 1;
    }
  }

  const leaguePopularityAverages: Record<string, number> = {};
  for (const [level, stats] of Object.entries(leaguePopularityStats)) {
    leaguePopularityAverages[level] = stats.count > 0
      ? Math.round((stats.totalPoints / stats.count) * 10) / 10
      : 0;
  }

  const popularityAverages = Object.entries(popularityStats)
    .filter(([_, stats]) => stats.count > 0)
    .map(([level, stats]) => ({
      level,
      label: popularityLabels[level],
      color: popularityColors[level],
      avgPoints: Math.round((stats.totalPoints / stats.count) * 10) / 10,
      totalPoints: stats.totalPoints,
      pickCount: stats.count,
      leagueAvg: leaguePopularityAverages[level] || 0,
    }))
    .sort((a, b) => {
      // Sort by popularity order: unique -> chalk
      const order = ['unique', 'rare', 'uncommon', 'common', 'popular', 'chalk'];
      return order.indexOf(a.level) - order.indexOf(b.level);
    });

  // Calculate average points by track type
  const trackTypeStats: Record<string, { totalPoints: number; count: number }> = {};
  for (const raceData of racePicksData) {
    if (raceData.race.status === 'final' && raceData.trackType && raceData.pick) {
      if (!trackTypeStats[raceData.trackType]) {
        trackTypeStats[raceData.trackType] = { totalPoints: 0, count: 0 };
      }
      trackTypeStats[raceData.trackType].totalPoints += raceData.totalPoints;
      trackTypeStats[raceData.trackType].count += 1;
    }
  }

  const trackTypeLabels: Record<string, string> = {
    superspeedway: 'Superspeedway',
    intermediate: 'Intermediate',
    short_track: 'Short Track',
    road_course: 'Road Course',
    street_course: 'Street Course',
    dirt: 'Dirt',
  };

  // Calculate LEAGUE-WIDE track type stats (all teams)
  const leagueTrackTypeStats: Record<string, { totalPoints: number; count: number }> = {};

  for (const pick of allPicksExpandedData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const trackType = race.track_info?.track_type || trackTypeByName.get(race.track) || null;
    if (!trackType) continue;

    const driversList = [
      { id: pick.driver_1_id },
      { id: pick.driver_2_id },
      { id: pick.driver_3_id },
    ];

    // Calculate total points for this pick
    let totalPoints = 0;
    let stageBonus = 0;
    let lapsLedBonus = 0;
    let allTop10 = true;

    for (const { id } of driversList) {
      const resultKey = `${race.id}-${id}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      if (result) {
        totalPoints += POSITION_POINTS[result.finish_position] || 0;
        if (result.stage_1_winner) stageBonus++;
        if (result.stage_2_winner) stageBonus++;
        if (result.most_laps_led && lapsLedBonus === 0) lapsLedBonus = 1;
        if (result.finish_position > 10) allTop10 = false;
      } else {
        allTop10 = false;
      }
    }

    const top10Bonus = allTop10 ? 1 : 0;
    totalPoints += stageBonus + lapsLedBonus + top10Bonus;

    if (!leagueTrackTypeStats[trackType]) {
      leagueTrackTypeStats[trackType] = { totalPoints: 0, count: 0 };
    }
    leagueTrackTypeStats[trackType].totalPoints += totalPoints;
    leagueTrackTypeStats[trackType].count += 1;
  }

  const leagueTrackTypeAverages: Record<string, number> = {};
  for (const [type, stats] of Object.entries(leagueTrackTypeStats)) {
    leagueTrackTypeAverages[type] = stats.count > 0
      ? Math.round((stats.totalPoints / stats.count) * 10) / 10
      : 0;
  }

  const trackTypeAverages = Object.entries(trackTypeStats)
    .map(([type, stats]) => ({
      type,
      label: trackTypeLabels[type] || type,
      avgPoints: stats.count > 0 ? Math.round((stats.totalPoints / stats.count) * 10) / 10 : 0,
      totalPoints: stats.totalPoints,
      raceCount: stats.count,
      leagueAvg: leagueTrackTypeAverages[type] || 0,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints);

  const owners = team.team_memberships?.filter((m: any) => m.role === 'owner') || [];
  const members = team.team_memberships?.filter((m: any) => m.role === 'member') || [];
  const bonusUses = bonus?.bonus_usages ?? 1;
  const favoriteDriver = team.favorite_driver as Driver | null;

  // Calculate TITS stats
  const titsStats = selectedSeasonId
    ? await calculateTeamTitsStats(supabase, id, selectedSeasonId)
    : null;

  return (
    <div className="space-y-8">
      {/* Season Selector */}
      {seasons.length > 0 && selectedSeasonId && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedSeason?.name} Season
            </h2>
          </div>
          <SeasonSelector
            seasons={seasons}
            currentSeasonId={selectedSeasonId}
            basePath={`/teams/${id}`}
          />
        </div>
      )}

      {/* Team Header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {team.logo_url ? (
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-yellow-500">#{team.car_number}</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-white">{team.name}</h1>
                <span className="px-3 py-1 bg-yellow-500 text-black font-bold rounded-full text-sm">
                  #{team.car_number}
                </span>
              </div>
              <p className="text-gray-400 mt-1">
                Owner{owners.length > 1 ? 's' : ''}:{' '}
                {owners.map((o: any) => o.profile?.name).join(', ') || 'None assigned'}
              </p>
              {isOwner && (
                <span className="inline-block mt-2 px-3 py-1 bg-green-500/20 text-green-500 text-sm rounded-full">
                  You own this team
                </span>
              )}
            </div>
          </div>
          {isOwner && (
            <Link
              href={`/teams/${id}/edit`}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Edit Profile
            </Link>
          )}
        </div>

        {/* Quote */}
        {team.quote && (
          <div className="mt-6 pl-4 border-l-4 border-yellow-500">
            <p className="text-lg text-gray-300 italic">"{team.quote}"</p>
          </div>
        )}
      </div>

      {/* Owner Headshot & Bio */}
      {(team.owner_headshot_url || team.bio || favoriteDriver) && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">About the Team</h2>
          <div className="flex flex-col md:flex-row gap-6">
            {team.owner_headshot_url && (
              <div className="flex-shrink-0">
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-700">
                  <img
                    src={team.owner_headshot_url}
                    alt="Team Owner"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 space-y-4">
              {team.bio && (
                <p className="text-gray-300 whitespace-pre-wrap">{team.bio}</p>
              )}
              {favoriteDriver && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400">Favorite Driver:</span>
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded font-medium">
                    #{favoriteDriver.car_number} {favoriteDriver.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Season Stats */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Season Stats</h2>
          {standing ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Rank</span>
                <span className={`text-2xl font-bold ${
                  (standing.rank || 0) <= 6 ? 'text-green-500' :
                  standing.rank === 7 ? 'text-yellow-500' : 'text-white'
                }`}>
                  #{standing.rank || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Points</span>
                <span className="text-2xl font-bold text-white">{standing.total_points}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Race Wins Picked</span>
                <span className="text-lg text-white">{standing.race_wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stage Wins Picked</span>
                <span className="text-lg text-white">{standing.stage_wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Top 10 Bonuses</span>
                <span className="text-lg text-white">{standing.top_10_bonuses}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No stats available yet.</p>
          )}
        </div>

        {/* TITS Remaining */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">TITS Remaining</h2>
          {titsStats ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tier 1 Remaining</span>
                <span className="text-xl font-bold text-amber-400">{titsStats.t1Remaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tier 2 Remaining</span>
                <span className="text-xl font-bold text-emerald-400">{titsStats.t2Remaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total TITS</span>
                <span className="text-2xl font-bold text-amber-500">{titsStats.titsRemaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">TITS %</span>
                <span className={`text-2xl font-bold ${
                  titsStats.titsPercent >= 50 ? 'text-green-500' :
                  titsStats.titsPercent >= 30 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {titsStats.titsPercent.toFixed(1)}%
                </span>
              </div>
              <div className="pt-2 border-t border-gray-700">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Picks Remaining</span>
                  <span className="text-gray-400">{titsStats.totalPicksRemaining}</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-500">5th Use Bonus</span>
                  <span className={`font-medium ${titsStats.bonusUsed ? 'text-red-400' : 'text-green-400'}`}>
                    {titsStats.bonusUsed ? 'Used' : 'Available'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No active season.</p>
          )}
        </div>

        {/* Team Members */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Team Members</h2>
          <div className="space-y-3">
            {owners.map((membership: any) => (
              <div key={membership.id} className="flex items-center justify-between">
                <span className="text-white">{membership.profile?.name}</span>
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs rounded">
                  Owner
                </span>
              </div>
            ))}
            {members.map((membership: any) => (
              <div key={membership.id} className="flex items-center justify-between">
                <span className="text-white">{membership.profile?.name}</span>
                <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                  Member
                </span>
              </div>
            ))}
            {team.team_memberships?.length === 0 && (
              <p className="text-gray-400 text-sm">No members assigned to this team.</p>
            )}
          </div>
        </div>
      </div>

      {/* Performance Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Average Points by Pick Popularity */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Avg Points by Popularity</h2>
          {popularityAverages.length > 0 ? (
            <div className="space-y-3">
              {popularityAverages.map((pop) => {
                const diff = Math.round((pop.avgPoints - pop.leagueAvg) * 10) / 10;
                return (
                  <div key={pop.level} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-bold rounded border ${pop.color}`}>
                        {pop.label}
                      </span>
                      <span className="text-gray-400 text-sm">({pop.pickCount})</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <span className="text-xl font-bold text-white">{pop.avgPoints}</span>
                        <span className={`text-xs ml-1 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ({diff >= 0 ? '+' : ''}{diff})
                        </span>
                      </div>
                      <div className="text-gray-500 text-xs border-l border-gray-600 pl-2">
                        <div className="text-gray-400">Lg</div>
                        <div>{pop.leagueAvg}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400">No completed races with pick data yet.</p>
          )}
        </div>

        {/* Average Points by Pick Strategy */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Avg Points by Strategy</h2>
          {strategyAverages.length > 0 ? (
            <div className="space-y-3">
              {strategyAverages.map((strategy) => {
                const diff = Math.round((strategy.avgPoints - strategy.leagueAvg) * 10) / 10;
                return (
                  <div key={strategy.name} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-bold rounded ${
                        strategy.name === 'Chalk' ? 'bg-amber-500/20 text-amber-400' :
                        strategy.name === 'Contrarian' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {strategy.name}
                      </span>
                      <span className="text-gray-400 text-sm">({strategy.raceCount})</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <span className="text-xl font-bold text-white">{strategy.avgPoints}</span>
                        <span className={`text-xs ml-1 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ({diff >= 0 ? '+' : ''}{diff})
                        </span>
                      </div>
                      <div className="text-gray-500 text-xs border-l border-gray-600 pl-2">
                        <div className="text-gray-400">Lg</div>
                        <div>{strategy.leagueAvg}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400">No completed races with strategy data yet.</p>
          )}
        </div>

        {/* Average Points by Track Type */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Avg Points by Track Type</h2>
          {trackTypeAverages.length > 0 ? (
            <div className="space-y-3">
              {trackTypeAverages.map((track) => {
                const diff = Math.round((track.avgPoints - track.leagueAvg) * 10) / 10;
                return (
                  <div key={track.type} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-bold rounded ${
                        track.type === 'superspeedway' ? 'bg-red-500/20 text-red-400' :
                        track.type === 'intermediate' ? 'bg-blue-500/20 text-blue-400' :
                        track.type === 'short_track' ? 'bg-amber-500/20 text-amber-400' :
                        track.type === 'road_course' ? 'bg-emerald-500/20 text-emerald-400' :
                        track.type === 'street_course' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-orange-500/20 text-orange-400'
                      }`}>
                        {track.label}
                      </span>
                      <span className="text-gray-400 text-sm">({track.raceCount})</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <span className="text-xl font-bold text-white">{track.avgPoints}</span>
                        <span className={`text-xs ml-1 ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ({diff >= 0 ? '+' : ''}{diff})
                        </span>
                      </div>
                      <div className="text-gray-500 text-xs border-l border-gray-600 pl-2">
                        <div className="text-gray-400">Lg</div>
                        <div>{track.leagueAvg}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400">No completed races with track data yet.</p>
          )}
        </div>
      </div>

      {/* Driver Usage */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Driver Usage & Performance</h2>
        {calculatedDriverUsages.length > 0 ? (
          <DriverUsageTable data={calculatedDriverUsages} />
        ) : (
          <p className="text-gray-400">No drivers have been used yet this season.</p>
        )}
      </div>

      {/* Race-by-Race Picks */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Season Picks & Results
        </h2>
        {racePicksData.length > 0 ? (
          <div className="space-y-4">
            {racePicksData.map(({ race, pick, drivers, totalPoints, stageBonus, lapsLedBonus, top10Bonus, strategy }) => (
              <div
                key={race.id}
                className={`border rounded-lg p-4 ${
                  race.status === 'final'
                    ? 'border-gray-700 bg-gray-900/50'
                    : 'border-purple-700/50 bg-purple-900/20'
                }`}
              >
                {/* Race Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-bold">#{race.race_number}</span>
                    <Link
                      href={`/races/${race.id}`}
                      className="text-white font-medium hover:text-amber-400 transition-colors"
                    >
                      {race.name}
                    </Link>
                    {strategy && (
                      <PickStrategyBadge strategy={strategy} size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {race.status === 'final' ? (
                      <span className="text-2xl font-bold text-amber-400">{totalPoints} pts</span>
                    ) : (
                      <span className="text-sm text-purple-400">
                        {race.status === 'upcoming' ? 'Upcoming' : 'In Progress'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Drivers Grid */}
                {pick ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {drivers.map(({ driver, points, position, stageWins, lapsLed }, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold text-sm">
                            #{driver?.car_number}
                          </span>
                          <span className="text-white text-sm truncate max-w-[120px]">
                            {driver?.name?.split(' ').pop()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {race.status === 'final' && (
                            <>
                              {position && (
                                <span className={`text-xs ${
                                  position <= 10 ? 'text-emerald-400' : 'text-gray-500'
                                }`}>
                                  P{position}
                                </span>
                              )}
                              {stageWins > 0 && (
                                <span className="text-xs text-purple-400" title="Stage wins">
                                  +{stageWins}S
                                </span>
                              )}
                              {lapsLed && (
                                <span className="text-xs text-cyan-400" title="Most laps led">
                                  +L
                                </span>
                              )}
                              <span className={`font-bold ${
                                points >= 8 ? 'text-emerald-400' :
                                points >= 5 ? 'text-amber-400' :
                                points > 0 ? 'text-gray-300' : 'text-gray-500'
                              }`}>
                                {points}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No picks submitted</p>
                )}

                {/* Bonuses Row */}
                {race.status === 'final' && pick && (stageBonus > 0 || lapsLedBonus > 0 || top10Bonus > 0) && (
                  <div className="mt-2 pt-2 border-t border-gray-700/50 flex flex-wrap gap-3 text-xs">
                    {stageBonus > 0 && (
                      <span className="text-purple-400">
                        Stage Bonus: +{stageBonus}
                      </span>
                    )}
                    {lapsLedBonus > 0 && (
                      <span className="text-cyan-400">
                        Laps Led: +{lapsLedBonus}
                      </span>
                    )}
                    {top10Bonus > 0 && (
                      <span className="text-emerald-400">
                        All Top 10: +{top10Bonus}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">No picks for this season yet.</p>
        )}
      </div>
    </div>
  );
}
