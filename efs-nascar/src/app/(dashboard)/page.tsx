import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import type { Race, Team, Standing, Pick, Track, TrackType, Season, Driver, ChampionshipPrediction } from '@/types';
import { LocalTime } from '@/components/LocalTime';
import {
  calculatePlayoffStandings,
  isRegularSeasonComplete,
  havePlayoffsStarted,
  type PlayoffTeamStanding,
  type RaceScore as PlayoffRaceScore,
} from '@/lib/playoff-standings';
import { calculateTeamTitsStats } from '@/lib/titsCalculation';
import { calculateDriverTiers } from '@/lib/driverTiers';
import { ChampionshipPick } from '@/components/ChampionshipPick';

// Force dynamic rendering to ensure cookies are read fresh
export const dynamic = 'force-dynamic';

interface RaceWithTrack extends Race {
  track_info: Track | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Get active season - dashboard always shows current season only
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Dashboard only shows the active season (no season selection)
  const selectedSeasonId = activeSeason?.id;
  const isViewingActiveSeason = true;

  // Get user's team
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user?.id)
    .single();

  const userTeam = membership?.team as Team | null;

  // Get championship prediction for user's team
  let championshipPrediction: ChampionshipPrediction | null = null;
  let championshipDriver: Driver | null = null;
  if (userTeam && selectedSeasonId) {
    const { data: prediction } = await supabase
      .from('championship_predictions')
      .select('*, driver:drivers(*)')
      .eq('team_id', userTeam.id)
      .eq('season_id', selectedSeasonId)
      .single();

    if (prediction) {
      championshipPrediction = prediction as ChampionshipPrediction;
      championshipDriver = (prediction as any).driver as Driver;
    }
  }

  // Get next upcoming race for the selected season with track info (only for active season)
  let nextRaceData = null;
  if (isViewingActiveSeason) {
    const { data } = await supabase
      .from('races')
      .select(`
        *,
        track_info:tracks(*)
      `)
      .eq('season_id', selectedSeasonId)
      .eq('status', 'upcoming')
      .order('scheduled_datetime', { ascending: true })
      .limit(1)
      .single();
    nextRaceData = data;
  }

  const nextRace = nextRaceData as RaceWithTrack | null;

  // Helper to get track type info
  const getTrackTypeInfo = (trackType: TrackType | undefined) => {
    switch (trackType) {
      case 'superspeedway':
        return { label: 'Superspeedway', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🏁' };
      case 'intermediate':
        return { label: 'Intermediate', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🔵' };
      case 'short_track':
        return { label: 'Short Track', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '🟡' };
      case 'road_course':
        return { label: 'Road Course', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '🟢' };
      case 'street_course':
        return { label: 'Street Course', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '🏙️' };
      case 'dirt':
        return { label: 'Dirt', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '🟤' };
      default:
        return null;
    }
  };

  // Check if user has submitted picks for next race
  let hasPicked = false;
  let userPick: Pick | null = null;
  if (nextRace && userTeam) {
    const { data: pick } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', userTeam.id)
      .eq('race_id', nextRace.id)
      .single();
    hasPicked = !!pick;
    userPick = pick as Pick | null;
  }

  // Get team submission counts for next race
  let submissionStats: {
    submitted: number;
    total: number;
    waitingOnTeams: { car_number: number; name: string }[];
  } | null = null;

  if (nextRace) {
    // Get all teams
    const { data: allTeams } = await supabase
      .from('teams')
      .select('id, car_number, name')
      .order('car_number', { ascending: true });

    // Get picks for this race
    const { data: racePicks } = await supabase
      .from('picks')
      .select('team_id')
      .eq('race_id', nextRace.id);

    const teamsWithPicks = new Set((racePicks || []).map(p => p.team_id));
    const totalTeams = (allTeams || []).length;
    const submittedCount = teamsWithPicks.size;

    // Find teams that haven't submitted
    const waitingOnTeams = (allTeams || [])
      .filter(t => !teamsWithPicks.has(t.id))
      .map(t => ({ car_number: t.car_number, name: t.name }));

    submissionStats = {
      submitted: submittedCount,
      total: totalTeams,
      waitingOnTeams,
    };
  }

  // Get all races for the selected season to determine regular vs playoff
  const { data: allRaces } = await supabase
    .from('races')
    .select('id, race_type, status, race_number')
    .eq('season_id', selectedSeasonId)
    .order('race_number', { ascending: true });

  // Create a map of race IDs to their fantasy league position (1-based index)
  const fantasyRaceNumbers: Record<string, number> = {};
  allRaces?.forEach((race, index) => {
    fantasyRaceNumbers[race.id] = index + 1;
  });

  // Treat null/undefined race_type as regular (for backwards compatibility with older seasons)
  const regularRaceIds = (allRaces || [])
    .filter(r => !r.race_type || r.race_type === 'regular')
    .map(r => r.id);
  const playoffRaceIds = (allRaces || [])
    .filter(r => r.race_type === 'playoff_round1' || r.race_type === 'playoff_round2' || r.race_type === 'playoff_finals')
    .map(r => r.id);

  const totalRegularRaces = regularRaceIds.length;
  const completedRegularRaces = (allRaces || []).filter(r => (!r.race_type || r.race_type === 'regular') && r.status === 'final').length;
  const completedPlayoffRaces = (allRaces || []).filter(r =>
    (r.race_type === 'playoff_round1' || r.race_type === 'playoff_round2' || r.race_type === 'playoff_finals') &&
    r.status === 'final'
  ).length;

  // Get all race scores for the selected season (used for laps_led calculation and fallback standings)
  const { data: raceScoresData } = await supabase
    .from('race_scores')
    .select('*, team:teams(*), race:races!inner(season_id, race_type, race_number)')
    .eq('race.season_id', selectedSeasonId);

  // Separate regular season scores from playoff scores
  // Treat null/undefined race_type as regular (for backwards compatibility with older seasons)
  const regularSeasonScores = (raceScoresData || []).filter(
    (s: any) => !s.race?.race_type || s.race?.race_type === 'regular'
  );
  const playoffRaceScores = (raceScoresData || []).filter(
    (s: any) => s.race?.race_type === 'playoff_round1' ||
               s.race?.race_type === 'playoff_round2' ||
               s.race?.race_type === 'playoff_finals'
  ) as PlayoffRaceScore[];

  // Get all standings for the selected season (legacy)
  let { data: standings } = await supabase
    .from('standings')
    .select('*, team:teams(*)')
    .eq('season_id', selectedSeasonId)
    .is('race_id', null) // Season totals
    .order('rank', { ascending: true });

  // Check if standings have meaningful data (at least one team with points)
  const hasStandingsData = standings && standings.length > 0 &&
    standings.some((s: any) => s.total_points > 0);

  // Aggregate laps_led_bonuses per team (used later for lucky dog)
  const lapsLedByTeam: Record<string, number> = {};

  // If no pre-calculated standings OR standings have no points, calculate from race_scores
  // IMPORTANT: Use only regular season scores for standings
  if (!hasStandingsData && regularSeasonScores && regularSeasonScores.length > 0) {
    // Aggregate scores by team (regular season only)
    const teamTotals: Record<string, {
      team_id: string;
      team: any;
      total_points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
      laps_led_bonuses: number;
    }> = {};

    for (const score of regularSeasonScores) {
      if (!teamTotals[score.team_id]) {
        teamTotals[score.team_id] = {
          team_id: score.team_id,
          team: score.team,
          total_points: 0,
          race_wins: 0,
          stage_wins: 0,
          top_10_bonuses: 0,
          laps_led_bonuses: 0,
        };
      }
      teamTotals[score.team_id].total_points += score.total_points || 0;
      teamTotals[score.team_id].top_10_bonuses += score.top_10_bonus || 0;
      teamTotals[score.team_id].laps_led_bonuses += score.laps_led_bonus || 0;
      teamTotals[score.team_id].stage_wins += score.stage_bonus || 0;
      if (score.driver_1_points === 10 || score.driver_2_points === 10 || score.driver_3_points === 10) {
        teamTotals[score.team_id].race_wins += 1;
      }

      // Also aggregate laps led
      if (!lapsLedByTeam[score.team_id]) {
        lapsLedByTeam[score.team_id] = 0;
      }
      lapsLedByTeam[score.team_id] += score.laps_led_bonus || 0;
    }

    const calculatedStandings = Object.values(teamTotals)
      .sort((a, b) => b.total_points - a.total_points)
      .map((team, index) => ({
        id: `calc-${team.team_id}`,
        team_id: team.team_id,
        season_id: selectedSeasonId,
        race_id: null,
        total_points: team.total_points,
        race_wins: team.race_wins,
        stage_wins: team.stage_wins,
        top_10_bonuses: team.top_10_bonuses,
        rank: index + 1,
        team: team.team,
        updated_at: new Date().toISOString(),
      }));

    standings = calculatedStandings as any;
  } else if (!hasStandingsData) {
    // Third fallback: Calculate from picks + race_results directly (regular season only)
    // Fetch all and filter client-side to handle null race_type for backwards compatibility
    const { data: allPicks } = await supabase
      .from('picks')
      .select('*, team:teams(*), race:races!inner(season_id, race_type)')
      .eq('race.season_id', selectedSeasonId);

    const { data: allRaceResults } = await supabase
      .from('race_results')
      .select('*, race:races!inner(season_id, race_type)')
      .eq('race.season_id', selectedSeasonId);

    // Filter to regular season races (null/undefined race_type = regular)
    const picks = (allPicks || []).filter((p: any) => !p.race?.race_type || p.race?.race_type === 'regular');
    const raceResults = (allRaceResults || []).filter((r: any) => !r.race?.race_type || r.race?.race_type === 'regular');

    if (picks && picks.length > 0 && raceResults && raceResults.length > 0) {
      // Build a lookup of race results by race_id and driver_id
      const resultsByRaceAndDriver: Record<string, {
        finish_position: number;
        stage_1_winner: boolean;
        stage_2_winner: boolean;
        most_laps_led: boolean;
      }> = {};

      for (const result of raceResults) {
        const key = `${result.race_id}-${result.driver_id}`;
        resultsByRaceAndDriver[key] = {
          finish_position: result.finish_position,
          stage_1_winner: result.stage_1_winner,
          stage_2_winner: result.stage_2_winner,
          most_laps_led: result.most_laps_led,
        };
      }

      const POSITION_POINTS: Record<number, number> = {
        1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
      };

      const teamTotals: Record<string, {
        team_id: string;
        team: any;
        total_points: number;
        race_wins: number;
        stage_wins: number;
        top_10_bonuses: number;
        laps_led_bonuses: number;
      }> = {};

      for (const pick of picks) {
        if (!teamTotals[pick.team_id]) {
          teamTotals[pick.team_id] = {
            team_id: pick.team_id,
            team: pick.team,
            total_points: 0,
            race_wins: 0,
            stage_wins: 0,
            top_10_bonuses: 0,
            laps_led_bonuses: 0,
          };
        }

        const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
        let racePoints = 0;
        let stageBonus = 0;
        let lapsLedBonus = 0;
        let allTop10 = true;

        for (const driverId of driverIds) {
          const key = `${pick.race_id}-${driverId}`;
          const result = resultsByRaceAndDriver[key];

          if (result) {
            const posPoints = POSITION_POINTS[result.finish_position] || 0;
            racePoints += posPoints;

            if (result.finish_position === 1) {
              teamTotals[pick.team_id].race_wins += 1;
            }

            if (result.stage_1_winner) {
              stageBonus += 1;
              teamTotals[pick.team_id].stage_wins += 1;
            }
            if (result.stage_2_winner) {
              stageBonus += 1;
              teamTotals[pick.team_id].stage_wins += 1;
            }

            if (result.most_laps_led && lapsLedBonus === 0) {
              lapsLedBonus = 1;
              teamTotals[pick.team_id].laps_led_bonuses += 1;
            }

            if (result.finish_position > 10) {
              allTop10 = false;
            }
          } else {
            allTop10 = false;
          }
        }

        if (allTop10) {
          racePoints += 1;
          teamTotals[pick.team_id].top_10_bonuses += 1;
        }

        teamTotals[pick.team_id].total_points += racePoints + stageBonus + lapsLedBonus;
      }

      // Also populate lapsLedByTeam
      for (const teamId in teamTotals) {
        lapsLedByTeam[teamId] = teamTotals[teamId].laps_led_bonuses;
      }

      const calculatedStandings = Object.values(teamTotals)
        .sort((a, b) => b.total_points - a.total_points)
        .map((team, index) => ({
          id: `calc-${team.team_id}`,
          team_id: team.team_id,
          season_id: selectedSeasonId,
          race_id: null,
          total_points: team.total_points,
          race_wins: team.race_wins,
          stage_wins: team.stage_wins,
          top_10_bonuses: team.top_10_bonuses,
          rank: index + 1,
          team: team.team,
          updated_at: new Date().toISOString(),
        }));

      standings = calculatedStandings as any;
    }
  } else {
    // Use pre-calculated standings, just aggregate laps_led from regular season race_scores
    for (const score of regularSeasonScores || []) {
      if (!lapsLedByTeam[score.team_id]) {
        lapsLedByTeam[score.team_id] = 0;
      }
      lapsLedByTeam[score.team_id] += score.laps_led_bonus || 0;
    }
  }

  // Calculate playoff standings if applicable
  const regularSeasonComplete = isRegularSeasonComplete(totalRegularRaces, completedRegularRaces);
  const playoffsStarted = havePlayoffsStarted(playoffRaceScores);
  const showPlayoffSection = (regularSeasonComplete || playoffsStarted) && playoffRaceIds.length > 0;

  let playoffStandings = null;
  if (showPlayoffSection && standings && standings.length > 0) {
    const playoffTeamStandings: PlayoffTeamStanding[] = standings.map((s: any) => ({
      team_id: s.team_id,
      team: s.team,
      total_points: s.total_points,
      race_wins: s.race_wins || 0,
      stage_wins: s.stage_wins || 0,
      top_10_bonuses: s.top_10_bonuses || 0,
      rank: s.rank,
    }));

    playoffStandings = calculatePlayoffStandings(playoffTeamStandings, playoffRaceScores);
  }

  // Calculate user's standing info
  const userStanding = standings?.find((s: any) => s.team_id === userTeam?.id);
  const userRank = userStanding?.rank || null;
  const userPoints = userStanding?.total_points || 0;

  // Find points at key positions for deficit calculations
  const getPointsAtRank = (rank: number) => {
    const standing = standings?.find((s: any) => s.rank === rank);
    return standing?.total_points || 0;
  };

  const points2nd = getPointsAtRank(2); // Second catbird seat
  const points6th = getPointsAtRank(6); // Last standard playoff spot
  const points15th = getPointsAtRank(15); // Last consolation spot (above muddy mile)

  // Calculate deficits (positive = ahead, negative = behind)
  const deficitVs2nd = userPoints - points2nd;
  const deficitVs6th = userPoints - points6th;
  const deficitVs15th = userPoints - points15th;

  // Get user's designation
  const getUserDesignation = (rank: number | null) => {
    if (!rank) return null;
    if (rank <= 2) return { emoji: '🐱', label: 'Catbird Seat', color: 'text-amber-400' };
    if (rank <= 6) return { emoji: '✅', label: 'Playoff Position', color: 'text-emerald-400' };
    if (rank === 7) return { emoji: '🐕', label: 'Lucky Dog', color: 'text-amber-400' };
    if (rank >= 16) return { emoji: '💩', label: 'Muddy Mile', color: 'text-red-400' };
    return { emoji: '', label: 'Consolation', color: 'text-purple-400' };
  };

  const userDesignation = getUserDesignation(userRank);

  // Calculate TITS% for user's team
  let userTitsStats: { titsPercent: number; titsRemaining: number } | null = null;
  if (userTeam && selectedSeasonId) {
    const titsStats = await calculateTeamTitsStats(supabase, userTeam.id, selectedSeasonId);
    if (titsStats) {
      userTitsStats = {
        titsPercent: titsStats.titsPercent,
        titsRemaining: titsStats.titsRemaining,
      };
    }
  }

  // Calculate Zig% (contrarian score) for user's team
  let userZigPercent: number | null = null;
  if (userTeam && selectedSeasonId) {
    // Get revealed races
    const { data: revealedRaces } = await supabase
      .from('races')
      .select('id')
      .eq('season_id', selectedSeasonId)
      .or(`status.eq.in_progress,status.eq.final,deadline_datetime.lt.${new Date().toISOString()}`);

    const revealedRaceIds = new Set((revealedRaces || []).map(r => r.id));

    if (revealedRaceIds.size > 0) {
      // Get all picks from revealed races
      const { data: allRevealedPicks } = await supabase
        .from('picks')
        .select('team_id, race_id, driver_1_id, driver_2_id, driver_3_id')
        .in('race_id', Array.from(revealedRaceIds));

      if (allRevealedPicks && allRevealedPicks.length > 0) {
        // Count how many teams picked each driver per race
        const driverPickCountsByRace: Record<string, Record<string, number>> = {};
        const teamCountByRace: Record<string, number> = {};

        for (const pick of allRevealedPicks) {
          if (!driverPickCountsByRace[pick.race_id]) {
            driverPickCountsByRace[pick.race_id] = {};
            teamCountByRace[pick.race_id] = 0;
          }
          teamCountByRace[pick.race_id]++;
          [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach(driverId => {
            if (driverId) {
              driverPickCountsByRace[pick.race_id][driverId] = (driverPickCountsByRace[pick.race_id][driverId] || 0) + 1;
            }
          });
        }

        // Calculate user's contrarian score
        const getPopularityLevel = (count: number, totalTeams: number): string => {
          const percentage = (count / totalTeams) * 100;
          if (count === 1) return 'unique';
          if (percentage <= 20) return 'rare';
          if (percentage <= 35) return 'uncommon';
          if (percentage <= 50) return 'common';
          if (percentage <= 70) return 'popular';
          return 'chalk';
        };

        const contrarianWeights: Record<string, number> = {
          unique: 100, rare: 80, uncommon: 60, common: 40, popular: 20, chalk: 0,
        };

        let totalWeight = 0;
        let pickCount = 0;

        const userPicks = allRevealedPicks.filter(p => p.team_id === userTeam.id);
        for (const pick of userPicks) {
          const totalTeams = teamCountByRace[pick.race_id] || 1;
          const driverCounts = driverPickCountsByRace[pick.race_id] || {};

          [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach(driverId => {
            if (driverId) {
              const count = driverCounts[driverId] || 1;
              const level = getPopularityLevel(count, totalTeams);
              totalWeight += contrarianWeights[level];
              pickCount++;
            }
          });
        }

        userZigPercent = pickCount > 0 ? Math.round(totalWeight / pickCount) : null;
      }
    }
  }

  // Get prior week (last completed race) results for user's team
  let priorWeekResult: { points: number; raceNumber: number; raceName: string; rankChange: number } | null = null;
  if (userTeam && selectedSeasonId) {
    // Get the last completed race
    const { data: lastCompletedRace } = await supabase
      .from('races')
      .select('id, race_number, name')
      .eq('season_id', selectedSeasonId)
      .eq('status', 'final')
      .order('race_number', { ascending: false })
      .limit(1)
      .single();

    if (lastCompletedRace) {
      // Get user's score for that race
      const { data: raceScore } = await supabase
        .from('race_scores')
        .select('total_points')
        .eq('team_id', userTeam.id)
        .eq('race_id', lastCompletedRace.id)
        .single();

      // Calculate rank change by comparing standings after last race vs two races ago
      let rankChange = 0;
      const { data: previousRace } = await supabase
        .from('races')
        .select('id, race_number')
        .eq('season_id', selectedSeasonId)
        .eq('status', 'final')
        .lt('race_number', lastCompletedRace.race_number)
        .order('race_number', { ascending: false })
        .limit(1)
        .single();

      if (previousRace) {
        // Get all race scores up to (but not including) the last race
        const { data: previousScores } = await supabase
          .from('race_scores')
          .select('team_id, total_points, race:races!inner(race_number, status, race_type)')
          .eq('race.season_id', selectedSeasonId)
          .lte('race.race_number', previousRace.race_number)
          .eq('race.status', 'final');

        const prevTeamTotals: Record<string, number> = {};
        for (const score of (previousScores || []).filter((s: any) => !s.race?.race_type || s.race?.race_type === 'regular')) {
          prevTeamTotals[score.team_id] = (prevTeamTotals[score.team_id] || 0) + (score.total_points || 0);
        }

        const prevSorted = Object.entries(prevTeamTotals).sort((a, b) => b[1] - a[1]);
        const prevRank = prevSorted.findIndex(([teamId]) => teamId === userTeam.id) + 1;

        if (prevRank > 0 && userRank) {
          rankChange = prevRank - userRank; // Positive = improved, negative = dropped
        }
      }

      priorWeekResult = {
        points: raceScore?.total_points || 0,
        raceNumber: lastCompletedRace.race_number,
        raceName: lastCompletedRace.name,
        rankChange,
      };
    }
  }

  // Calculate Lucky Dog points and ranking
  // Lucky Dog: team outside top 6 with most race wins, with tiebreakers:
  // 1. Race wins, 2. Stage wins, 3. Laps led leaders chosen, 4. Top 10 bonuses
  interface LuckyDogStats {
    team_id: string;
    team_name: string;
    rank: number;
    total_points: number;
    race_wins: number;
    stage_wins: number;
    laps_led_bonuses: number;
    top_10_bonuses: number;
  }

  const luckyDogEligible: LuckyDogStats[] = (standings || [])
    .filter((s: any) => s.rank && s.rank > 6)
    .map((s: any) => ({
      team_id: s.team_id,
      team_name: s.team?.name || 'Unknown',
      rank: s.rank,
      total_points: s.total_points,
      race_wins: s.race_wins || 0,
      stage_wins: s.stage_wins || 0,
      laps_led_bonuses: lapsLedByTeam[s.team_id] || 0,
      top_10_bonuses: s.top_10_bonuses || 0,
    }));

  // Sort by lucky dog criteria
  luckyDogEligible.sort((a, b) => {
    if (b.race_wins !== a.race_wins) return b.race_wins - a.race_wins;
    if (b.stage_wins !== a.stage_wins) return b.stage_wins - a.stage_wins;
    if (b.laps_led_bonuses !== a.laps_led_bonuses) return b.laps_led_bonuses - a.laps_led_bonuses;
    return b.top_10_bonuses - a.top_10_bonuses;
  });

  // Find user's lucky dog rank (1 = in lucky dog position)
  const userLuckyDogRank = userRank && userRank > 6
    ? luckyDogEligible.findIndex((t) => t.team_id === userTeam?.id) + 1
    : null;

  // Get the team in actual lucky dog position for comparison
  const luckyDogLeader = luckyDogEligible[0] || null;

  // Get recent announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*, author:profiles(name)')
    .order('posted_at', { ascending: false })
    .limit(3);

  // Calculate countdown to deadline
  const getTimeUntilDeadline = (deadline: string) => {
    const now = Date.now();
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - now;

    if (diff <= 0) return 'Deadline passed';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Check if deadline is actually passed (for conditional rendering)
  const isDeadlinePassed = nextRace ? new Date(nextRace.deadline_datetime).getTime() < Date.now() : false;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header - hidden on mobile */}
      <div className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-purple-400 mt-1">
            {activeSeason ? `${activeSeason.name} Season` : 'No active season'}
          </p>
        </div>
      </div>

      {/* Alert if no team */}
      {!userTeam && (
        <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-lg">
          <p className="font-medium">You&apos;re not assigned to a team yet.</p>
          <p className="text-sm mt-1 text-amber-400/80">Contact a commissioner to be added to a team.</p>
        </div>
      )}

      {/* Championship Pick Section - Preseason only */}
      {userTeam && selectedSeasonId && !activeSeason?.championship_predictions_revealed && (
        <ChampionshipPick
          teamId={userTeam.id}
          seasonId={selectedSeasonId}
          revealed={false}
          initialPrediction={championshipPrediction}
          initialDriver={championshipDriver}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Next Race Card */}
        <div className="lg:col-span-2 glass rounded-xl p-6 card-hover">
          <h2 className="text-xl font-bold text-white mb-4">Next Race</h2>
          {nextRace ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  {/* Track Logo */}
                  <div className="relative w-20 h-20 flex-shrink-0 bg-purple-900/30 rounded-lg overflow-hidden flex items-center justify-center border border-purple-700/30">
                    {nextRace.track_info?.logo_url ? (
                      <Image
                        src={nextRace.track_info.logo_url}
                        alt={nextRace.track_info.name}
                        width={72}
                        height={72}
                        className="object-contain"
                      />
                    ) : (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                          {fantasyRaceNumbers[nextRace.id] || nextRace.race_number}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">{nextRace.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <p className="text-purple-300">{nextRace.track}</p>
                      {nextRace.track_info && (
                        <span className={`px-2 py-0.5 text-xs rounded border ${getTrackTypeInfo(nextRace.track_info.track_type)?.color || ''}`}>
                          {getTrackTypeInfo(nextRace.track_info.track_type)?.icon} {getTrackTypeInfo(nextRace.track_info.track_type)?.label}
                          {nextRace.track_info.length_miles && (
                            <span className="ml-1 opacity-75">({nextRace.track_info.length_miles} mi)</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-purple-400">Deadline</div>
                  <div className="text-2xl font-bold text-white">
                    {getTimeUntilDeadline(nextRace.deadline_datetime)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-purple-400 mb-6">
                <span>
                  Race #{fantasyRaceNumbers[nextRace.id] || nextRace.race_number} •{' '}
                  <LocalTime dateStr={nextRace.scheduled_datetime} format="long" />
                </span>
              </div>

              {userTeam && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    {isDeadlinePassed ? (
                      <div className={`flex items-center ${hasPicked ? 'text-emerald-400' : 'text-red-400'}`}>
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          {hasPicked ? (
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          ) : (
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          )}
                        </svg>
                        {hasPicked ? 'Picks submitted' : 'Deadline missed'}
                      </div>
                    ) : hasPicked ? (
                      <div className="flex items-center text-emerald-400">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Picks submitted
                      </div>
                    ) : (
                      <div className="flex items-center text-amber-400">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Picks not submitted
                      </div>
                    )}
                    {isDeadlinePassed ? (
                      <Link
                        href={`/races/${nextRace.id}/picks`}
                        className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 shadow-lg shadow-purple-500/25 transition-all"
                      >
                        View All Picks
                      </Link>
                    ) : (
                      <Link
                        href={`/picks?race=${nextRace.id}`}
                        className="px-5 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
                      >
                        {hasPicked ? 'Edit Picks' : 'Submit Picks'}
                      </Link>
                    )}
                  </div>

                  {/* Team submission status */}
                  {submissionStats && !isDeadlinePassed && (
                    <div className="pt-3 border-t border-purple-700/30 text-sm text-purple-300">
                      <span className="font-medium">{submissionStats.submitted} of {submissionStats.total}</span>
                      <span className="text-purple-400"> teams submitted.</span>
                      {submissionStats.waitingOnTeams.length > 0 && submissionStats.waitingOnTeams.length <= 5 && (
                        <span className="text-purple-400">
                          {' '}Waiting on{' '}
                          <span className="text-purple-300">
                            {submissionStats.waitingOnTeams.map((t, i) => (
                              <span key={t.car_number}>
                                #{t.car_number}
                                {i < submissionStats.waitingOnTeams.length - 2 ? ', ' :
                                 i === submissionStats.waitingOnTeams.length - 2 ? ' & ' : ''}
                              </span>
                            ))}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-purple-400">
              {!isViewingActiveSeason ? (
                <div className="text-center py-4">
                  <p className="text-lg mb-2">Viewing {activeSeason?.name} Season</p>
                  <p className="text-sm text-purple-500">This is a past season. Switch to the current season to see upcoming races.</p>
                </div>
              ) : (
                <p>No upcoming races scheduled.</p>
              )}
            </div>
          )}
        </div>

        {/* Your Team Card - Enhanced */}
        {userTeam && (
          <div className="glass rounded-xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Your Team</h2>
              {userRank && (
                <div className={`flex items-center gap-1 ${userDesignation?.color || 'text-purple-400'}`}>
                  <span className="text-lg font-bold">#{userRank}</span>
                  {userDesignation?.emoji && <span>{userDesignation.emoji}</span>}
                </div>
              )}
            </div>

            {/* Team Identity */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-purple-800/30 border border-purple-500/30 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                {userTeam.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={userTeam.logo_url}
                    alt={userTeam.name}
                    className="w-14 h-14 object-cover rounded-full"
                  />
                ) : (
                  <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">#{userTeam.car_number}</span>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{userTeam.name}</h3>
                {userDesignation && (
                  <span className={`text-sm ${userDesignation.color}`}>{userDesignation.label}</span>
                )}
              </div>
            </div>

            {/* Points & Key Stats */}
            {userStanding && (
              <div className="mb-4 p-3 bg-purple-900/30 rounded-lg">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                      {userPoints}
                    </div>
                    <div className="text-xs text-purple-400">Points</div>
                  </div>
                  {userTitsStats && (
                    <div>
                      <div className={`text-2xl font-bold ${
                        userTitsStats.titsPercent >= 50 ? 'text-green-400' :
                        userTitsStats.titsPercent >= 30 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {userTitsStats.titsPercent.toFixed(0)}%
                      </div>
                      <div className="text-xs text-purple-400">TITS%</div>
                    </div>
                  )}
                  {userZigPercent !== null && (
                    <div>
                      <div className={`text-2xl font-bold ${
                        userZigPercent >= 60 ? 'text-green-400' :
                        userZigPercent >= 40 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {userZigPercent}%
                      </div>
                      <div className="text-xs text-purple-400">Zig%</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Prior Week Results */}
            {priorWeekResult && (
              <div className="mb-4 p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-purple-400">Last Race (#{priorWeekResult.raceNumber})</span>
                  {priorWeekResult.rankChange !== 0 && (
                    <span className={`text-xs font-medium ${
                      priorWeekResult.rankChange > 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {priorWeekResult.rankChange > 0 ? '▲' : '▼'} {Math.abs(priorWeekResult.rankChange)} spot{Math.abs(priorWeekResult.rankChange) !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white">{priorWeekResult.points}</span>
                  <span className="text-xs text-purple-500">pts</span>
                </div>
              </div>
            )}

            {/* Position Deficits */}
            {userStanding && standings && standings.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="text-xs text-purple-400 uppercase tracking-wider mb-2">Position Gaps</div>

                {/* vs 2nd (Catbird Seat) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 2nd 🐱</span>
                  <span className={deficitVs2nd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs2nd >= 0 ? '+' : ''}{deficitVs2nd}
                  </span>
                </div>

                {/* vs 6th (Last Playoff Spot) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 6th ✅</span>
                  <span className={deficitVs6th >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs6th >= 0 ? '+' : ''}{deficitVs6th}
                  </span>
                </div>

                {/* vs 15th (Last Consolation Spot) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 15th</span>
                  <span className={deficitVs15th >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs15th >= 0 ? '+' : ''}{deficitVs15th}
                  </span>
                </div>
              </div>
            )}

            {/* Lucky Dog Standings (only if outside top 6) */}
            {userLuckyDogRank && userStanding && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-amber-400 font-medium">🐕 Lucky Dog Race</span>
                  <span className="text-sm font-bold text-amber-400">
                    {userLuckyDogRank === 1 ? 'In Position!' : `#${userLuckyDogRank}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-purple-300">
                    Wins: <span className="text-white font-medium">{userStanding.race_wins || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Stages: <span className="text-white font-medium">{userStanding.stage_wins || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Laps Led: <span className="text-white font-medium">{lapsLedByTeam[userTeam.id] || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Top 10s: <span className="text-white font-medium">{userStanding.top_10_bonuses || 0}</span>
                  </div>
                </div>
                {userLuckyDogRank > 1 && luckyDogLeader && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-xs text-purple-400">
                    Leader: {luckyDogLeader.team_name} ({luckyDogLeader.race_wins}W / {luckyDogLeader.stage_wins}S)
                  </div>
                )}
              </div>
            )}

            <Link
              href={`/teams/${userTeam.id}`}
              className="block text-center text-amber-400 hover:text-amber-300 text-sm"
            >
              View Team Profile →
            </Link>
          </div>
        )}
      </div>

      {/* Playoff Standings Preview */}
      {showPlayoffSection && playoffStandings && (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                Fantasy Playoffs
              </h2>
              <p className="text-sm text-purple-400">
                {playoffStandings.playoffRound === 'not_started' ? 'Starting soon' :
                 playoffStandings.playoffRound === 'round1' ? 'Round 1' :
                 playoffStandings.playoffRound === 'round2' ? 'Round 2' :
                 playoffStandings.playoffRound === 'finals' ? 'Finals' :
                 'Complete'} • {completedPlayoffRaces} of {playoffRaceIds.length} races
              </p>
            </div>
            <Link
              href="/standings"
              className="text-amber-400 hover:text-amber-300 text-sm"
            >
              View Full Standings →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Championship Bracket Summary */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-amber-400 font-bold mb-2">Championship</h3>
              <p className="text-xs text-purple-400 mb-2">Top 7 teams</p>
              {playoffStandings.playoffRound === 'not_started' ? (
                <div className="text-sm text-purple-300">
                  {playoffStandings.championshipBracket.catbirdSeats.slice(0, 2).map(teamId => {
                    const team = standings?.find((s: any) => s.team_id === teamId);
                    return team ? (
                      <div key={teamId} className="flex items-center gap-1 mb-1">
                        <span className="text-xs">🐱</span>
                        <span className="text-amber-400 font-medium">#{team.team?.car_number}</span>
                        <span className="text-white text-xs">{team.team?.abbreviation || team.team?.name}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              ) : (
                <div className="text-sm text-purple-300">
                  {(() => {
                    const currentStandings = playoffStandings.playoffRound === 'finals' || playoffStandings.playoffRound === 'complete'
                      ? playoffStandings.championshipBracket.finals
                      : playoffStandings.playoffRound === 'round2'
                        ? playoffStandings.championshipBracket.round2
                        : playoffStandings.championshipBracket.round1;
                    return currentStandings.slice(0, 4).map((s, i) => (
                      <div key={s.team_id} className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-amber-400 font-medium">#{s.team?.car_number}</span>
                          <span className="text-white text-xs">{s.team?.abbreviation || s.team?.name}</span>
                        </div>
                        <span className="text-white font-bold text-xs">{s.total_points}pts</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Consolation Bracket Summary */}
            <div className="bg-purple-600/20 border border-purple-500/30 rounded-lg p-4">
              <h3 className="text-purple-300 font-bold mb-2">Consolation</h3>
              <p className="text-xs text-purple-400 mb-2">Teams 8-15</p>
              {playoffStandings.consolationBracket.slice(0, 4).map((s, i) => (
                <div key={s.team_id} className="flex items-center justify-between mb-1 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 font-medium">#{s.team?.car_number}</span>
                    <span className="text-white text-xs">{s.team?.abbreviation || s.team?.name}</span>
                  </div>
                  <span className="text-white font-bold text-xs">{s.total_points}pts</span>
                </div>
              ))}
            </div>

            {/* Muddy Mile Summary */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <h3 className="text-red-400 font-bold mb-2">💩 Muddy Mile</h3>
              <p className="text-xs text-purple-400 mb-2">Bottom 2 battle</p>
              {playoffStandings.muddyMile.map((s, i) => (
                <div key={s.team_id} className="flex items-center justify-between mb-1 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 font-medium">#{s.team?.car_number}</span>
                    <span className="text-white text-xs">{s.team?.abbreviation || s.team?.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white font-bold text-xs">{s.total_points}pts</span>
                    <span className={`text-xs ml-1 ${i === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {i === 0 ? '↑' : '↓'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Announcements */}
      {announcements && announcements.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Announcements</h2>
          <div className="space-y-4">
            {announcements.map((announcement: any) => (
              <div key={announcement.id} className="border-l-4 border-amber-500 pl-4">
                <h3 className="text-white font-medium">{announcement.title}</h3>
                <p className="text-purple-300 text-sm mt-1">{announcement.body}</p>
                <p className="text-purple-500 text-xs mt-2">
                  {announcement.author?.name} •{' '}
                  <LocalTime dateStr={announcement.posted_at} format="dateOnly" />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
