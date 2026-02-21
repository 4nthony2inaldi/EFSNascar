import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Standing, Team, Season, RaceType, ScoringConfig } from '@/types';
import { SeasonSelector, SEASON_COOKIE_NAME } from '@/components/SeasonSelector';
import { CumulativePointsChart } from '@/components/CumulativePointsChart';
import {
  calculatePlayoffStandings,
  isRegularSeasonComplete,
  havePlayoffsStarted,
  type PlayoffTeamStanding,
  type RaceScore,
} from '@/lib/playoff-standings';
import {
  getPlayoffConfig,
  getPositionPoints,
  getStage1BonusPoints,
  getStage2BonusPoints,
  getStage3BonusPoints,
  getLapsLedBonusPoints,
  getTop10AllDriversBonusPoints,
} from '@/lib/scoring-config';
import { PlayoffBracket } from '@/components/PlayoffBracket';

// Force dynamic rendering to ensure cookies are read fresh
export const dynamic = 'force-dynamic';

interface StandingsPageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function StandingsPage({ searchParams }: StandingsPageProps) {
  const supabase = await createClient();
  const params = await searchParams;
  const cookieStore = await cookies();

  // Parallelize initial queries that don't depend on each other
  const [
    { data: { user } },
    { data: allSeasons },
    { data: activeSeason },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('seasons').select('*').order('year', { ascending: false }),
    supabase.from('seasons').select('*').eq('is_active', true).single(),
  ]);

  const seasons = (allSeasons || []) as Season[];

  // Get user's team membership (depends on user)
  const { data: membership } = user ? await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user.id)
    .single() : { data: null };
  const userTeamId = membership?.team_id;

  // Determine which season to display (from URL param, then cookie, then default to active)
  const seasonCookie = cookieStore.get(SEASON_COOKIE_NAME)?.value;
  const selectedSeasonId = params.season || seasonCookie || activeSeason?.id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || activeSeason;

  // Get scoring configuration for this season
  const { data: scoringConfig } = await supabase
    .from('scoring_configs')
    .select('*')
    .eq('season_id', selectedSeasonId)
    .single();

  const config = scoringConfig as ScoringConfig | null;
  const playoffOpts = getPlayoffConfig(config);

  // Get all championship predictions when revealed
  let allChampionshipPicks: { team_name: string; team_id: string; car_number: number; driver_name: string; driver_number: number }[] = [];
  if (activeSeason?.championship_predictions_revealed) {
    const { data: allPredictions } = await supabase
      .from('championship_predictions')
      .select('team_id, driver:drivers(name, car_number), team:teams(name, car_number)')
      .eq('season_id', activeSeason.id);

    if (allPredictions) {
      allChampionshipPicks = allPredictions
        .map((p: any) => ({
          team_name: p.team?.name || 'Unknown',
          team_id: p.team_id,
          car_number: p.team?.car_number || 0,
          driver_name: p.driver?.name || 'Unknown',
          driver_number: p.driver?.car_number || 0,
        }))
        .sort((a, b) => a.car_number - b.car_number);
    }
  }

  // Get tiebreaker order from config, with fallback to default
  const tiebreakerOrder = config?.tiebreaker_order || ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'];

  // Tiebreaker labels for display
  const tiebreakerLabels: Record<string, string> = {
    race_wins: 'Most race winners picked',
    stage_wins: 'Most stage winners picked',
    laps_led: 'Most laps led picked',
    top_10_bonuses: 'Most "all 3 in top 10" bonuses',
    allstar_position: 'All-Star race finish position',
  };

  // Helper function for tiebreaker comparison
  const compareTiebreakers = (a: any, b: any) => {
    // Primary: Total points
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;

    // Apply tiebreakers in configured order
    for (const tiebreaker of tiebreakerOrder) {
      let aVal = 0, bVal = 0;
      switch (tiebreaker) {
        case 'race_wins':
          aVal = a.race_wins || 0;
          bVal = b.race_wins || 0;
          break;
        case 'stage_wins':
          aVal = a.stage_wins || 0;
          bVal = b.stage_wins || 0;
          break;
        case 'laps_led':
          aVal = a.laps_led_bonuses || 0;
          bVal = b.laps_led_bonuses || 0;
          break;
        case 'top_10_bonuses':
          aVal = a.top_10_bonuses || 0;
          bVal = b.top_10_bonuses || 0;
          break;
        case 'allstar_position':
          // Lower position is better, so we flip the comparison
          // 0 or null means no position, sort last
          aVal = a.allstar_position || 999;
          bVal = b.allstar_position || 999;
          if (aVal !== bVal) return aVal - bVal; // Lower is better
          continue;
      }
      if (bVal !== aVal) return bVal - aVal; // Higher is better (except allstar)
    }
    return 0;
  };

  // Get race counts by type
  const { data: allRaces } = await supabase
    .from('races')
    .select('id, race_type, status, race_number')
    .eq('season_id', selectedSeasonId);

  // Treat null/undefined race_type as regular (for backwards compatibility with older seasons)
  const regularRaces = allRaces?.filter(r => !r.race_type || r.race_type === 'regular') || [];
  const playoffRaces = allRaces?.filter(r =>
    r.race_type === 'playoff_round1' ||
    r.race_type === 'playoff_round2' ||
    r.race_type === 'playoff_finals'
  ) || [];

  const completedRegularRaces = regularRaces.filter(r => r.status === 'final').length;
  const completedPlayoffRaces = playoffRaces.filter(r => r.status === 'final').length;
  const totalRegularRaces = regularRaces.length;

  // Get all race scores for the selected season
  const { data: allRaceScores } = await supabase
    .from('race_scores')
    .select('*, team:teams(id, name, abbreviation, car_number), race:races!inner(id, season_id, race_type, race_number, status)')
    .eq('race.season_id', selectedSeasonId);

  // Separate regular season scores from playoff scores
  // Treat null/undefined race_type as regular (for backwards compatibility with older seasons)
  const regularSeasonScores = (allRaceScores || []).filter(
    (s: any) => !s.race?.race_type || s.race?.race_type === 'regular'
  );
  const playoffRaceScores = (allRaceScores || []).filter(
    (s: any) => s.race?.race_type === 'playoff_round1' ||
               s.race?.race_type === 'playoff_round2' ||
               s.race?.race_type === 'playoff_finals'
  ) as RaceScore[];

  // Load race winners and picks to correctly determine race wins
  // (instead of relying on point value matching which breaks with custom scoring configs)
  const completedRaceIds = (allRaces || []).filter(r => r.status === 'final').map(r => r.id);
  const [{ data: raceWinners }, { data: allSeasonPicks }] = await Promise.all([
    supabase
      .from('race_results')
      .select('race_id, driver_id')
      .eq('finish_position', 1)
      .in('race_id', completedRaceIds.length > 0 ? completedRaceIds : ['none']),
    supabase
      .from('picks')
      .select('race_id, team_id, driver_1_id, driver_2_id, driver_3_id')
      .in('race_id', completedRaceIds.length > 0 ? completedRaceIds : ['none']),
  ]);

  // Build lookup: race_id -> winning driver_id
  const raceWinnerMap = new Map<string, string>();
  for (const winner of raceWinners || []) {
    raceWinnerMap.set(winner.race_id, winner.driver_id);
  }

  // Build lookup: "race_id-team_id" -> Set of picked driver IDs
  const picksLookup = new Map<string, Set<string>>();
  for (const pick of allSeasonPicks || []) {
    const drivers = new Set([pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].filter(Boolean));
    picksLookup.set(`${pick.race_id}-${pick.team_id}`, drivers);
  }

  // Calculate regular season standings
  let regularSeasonStandings: any[] = [];

  // First try: Calculate from race_scores
  if (regularSeasonScores && regularSeasonScores.length > 0) {
    const regularSeasonTotals: Record<string, {
      team_id: string;
      team: any;
      total_points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
      laps_led_bonuses: number;
    }> = {};

    for (const score of regularSeasonScores) {
      if (!regularSeasonTotals[score.team_id]) {
        regularSeasonTotals[score.team_id] = {
          team_id: score.team_id,
          team: score.team,
          total_points: 0,
          race_wins: 0,
          stage_wins: 0,
          top_10_bonuses: 0,
          laps_led_bonuses: 0,
        };
      }
      regularSeasonTotals[score.team_id].total_points += score.total_points || 0;
      regularSeasonTotals[score.team_id].top_10_bonuses += score.top_10_bonus || 0;
      regularSeasonTotals[score.team_id].laps_led_bonuses += score.laps_led_bonus || 0;
      regularSeasonTotals[score.team_id].stage_wins += score.stage_bonus || 0;
      // Check for race win by verifying team actually picked the race winner
      const scoreRaceId = (score.race as any)?.id;
      const winningDriverId = scoreRaceId ? raceWinnerMap.get(scoreRaceId) : null;
      if (winningDriverId) {
        const teamPickedDrivers = picksLookup.get(`${scoreRaceId}-${score.team_id}`);
        if (teamPickedDrivers?.has(winningDriverId)) {
          regularSeasonTotals[score.team_id].race_wins += 1;
        }
      }
    }

    regularSeasonStandings = Object.values(regularSeasonTotals)
      .sort(compareTiebreakers)
      .map((team, index) => ({
        id: `reg-${team.team_id}`,
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
  }

  // Fallback: Calculate from picks + race_results if no race_scores data
  if (regularSeasonStandings.length === 0) {
    // Fetch all picks and filter to regular season races
    const { data: allPicks } = await supabase
      .from('picks')
      .select('*, team:teams(id, name, abbreviation, car_number), race:races!inner(id, season_id, race_type)')
      .eq('race.season_id', selectedSeasonId);

    const { data: allRaceResults } = await supabase
      .from('race_results')
      .select('*, race:races!inner(id, season_id, race_type)')
      .eq('race.season_id', selectedSeasonId);

    // Filter to regular season races (null/undefined = regular)
    const regularPicks = (allPicks || []).filter((p: any) => !p.race?.race_type || p.race?.race_type === 'regular');
    const regularResults = (allRaceResults || []).filter((r: any) => !r.race?.race_type || r.race?.race_type === 'regular');

    if (regularPicks.length > 0 && regularResults.length > 0) {
      // Build results lookup
      const resultsByRaceAndDriver: Record<string, {
        finish_position: number;
        stage_1_winner: boolean;
        stage_2_winner: boolean;
        stage_3_winner: boolean;
        most_laps_led: boolean;
      }> = {};

      for (const result of regularResults) {
        const key = `${result.race_id}-${result.driver_id}`;
        resultsByRaceAndDriver[key] = {
          finish_position: result.finish_position,
          stage_1_winner: result.stage_1_winner || false,
          stage_2_winner: result.stage_2_winner || false,
          stage_3_winner: result.stage_3_winner || false,
          most_laps_led: result.most_laps_led || false,
        };
      }

      const POSITION_POINTS: Record<number, number> = getPositionPoints(config);

      const teamTotals: Record<string, {
        team_id: string;
        team: any;
        total_points: number;
        race_wins: number;
        stage_wins: number;
        top_10_bonuses: number;
        laps_led_bonuses: number;
      }> = {};

      for (const pick of regularPicks) {
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
              stageBonus += getStage1BonusPoints(config);
              teamTotals[pick.team_id].stage_wins += 1;
            }
            if (result.stage_2_winner) {
              stageBonus += getStage2BonusPoints(config);
              teamTotals[pick.team_id].stage_wins += 1;
            }
            if (result.stage_3_winner) {
              stageBonus += getStage3BonusPoints(config);
              teamTotals[pick.team_id].stage_wins += 1;
            }

            if (result.most_laps_led && lapsLedBonus === 0) {
              lapsLedBonus = getLapsLedBonusPoints(config);
              teamTotals[pick.team_id].laps_led_bonuses += 1;
            }

            if (result.finish_position > 10) {
              allTop10 = false;
            }
          } else {
            allTop10 = false;
          }
        }

        if (allTop10 && driverIds.every(id => id)) {
          racePoints += getTop10AllDriversBonusPoints(config);
          teamTotals[pick.team_id].top_10_bonuses += 1;
        }

        teamTotals[pick.team_id].total_points += racePoints + stageBonus + lapsLedBonus;
      }

      regularSeasonStandings = Object.values(teamTotals)
        .sort(compareTiebreakers)
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
    }
  }

  // Check if we should show playoff standings
  const regularSeasonComplete = isRegularSeasonComplete(totalRegularRaces, completedRegularRaces);
  const playoffsStarted = havePlayoffsStarted(playoffRaceScores);
  const showPlayoffSection = (regularSeasonComplete || playoffsStarted) && playoffRaces.length > 0;

  // Calculate playoff standings if playoffs have started
  let playoffStandings = null;
  if (showPlayoffSection && regularSeasonStandings.length > 0) {
    const playoffTeamStandings: PlayoffTeamStanding[] = regularSeasonStandings.map(s => ({
      team_id: s.team_id,
      team: s.team,
      total_points: s.total_points,
      race_wins: s.race_wins,
      stage_wins: s.stage_wins,
      top_10_bonuses: s.top_10_bonuses,
      rank: s.rank,
    }));

    playoffStandings = calculatePlayoffStandings(playoffTeamStandings, playoffRaceScores, config, {
      raceWinnerMap,
      picksLookup,
    });
  }

  // Build chart data using regular season scores only
  interface ChartRaceData {
    raceNumber: number;
    raceName: string;
    [teamId: string]: number | string;
  }

  const chartData: ChartRaceData[] = [];
  const cumulativeByTeam: Record<string, number> = {};

  if (regularSeasonScores.length > 0) {
    // Build from race_scores
    const scoresByRace: Record<number, { raceName: string; scores: { teamId: string; points: number }[] }> = {};

    for (const score of regularSeasonScores) {
      const race = score.race as any;
      if (!race) continue;
      const raceNum = race.race_number;

      if (!scoresByRace[raceNum]) {
        scoresByRace[raceNum] = { raceName: `Race ${raceNum}`, scores: [] };
      }
      scoresByRace[raceNum].scores.push({
        teamId: score.team_id,
        points: score.total_points || 0,
      });
    }

    const sortedRaceNums = Object.keys(scoresByRace).map(Number).sort((a, b) => a - b);

    for (const raceNum of sortedRaceNums) {
      const raceData = scoresByRace[raceNum];
      const dataPoint: ChartRaceData = {
        raceNumber: raceNum,
        raceName: raceData.raceName,
      };

      for (const { teamId, points } of raceData.scores) {
        cumulativeByTeam[teamId] = (cumulativeByTeam[teamId] || 0) + points;
      }

      for (const teamId in cumulativeByTeam) {
        dataPoint[teamId] = cumulativeByTeam[teamId];
      }

      chartData.push(dataPoint);
    }
  } else {
    // Fallback: Build chart data from picks + race_results
    const { data: chartPicks } = await supabase
      .from('picks')
      .select('team_id, driver_1_id, driver_2_id, driver_3_id, race:races!inner(id, race_number, name, season_id, race_type)')
      .eq('race.season_id', selectedSeasonId);

    const { data: chartRaceResults } = await supabase
      .from('race_results')
      .select('race_id, driver_id, finish_position, stage_1_winner, stage_2_winner, stage_3_winner, most_laps_led')
      .in('race_id', chartPicks?.map(p => (p.race as any)?.id).filter(Boolean) || []);

    // Filter to regular season races
    const regularChartPicks = (chartPicks || []).filter((p: any) => !p.race?.race_type || p.race?.race_type === 'regular');

    if (regularChartPicks.length > 0 && chartRaceResults && chartRaceResults.length > 0) {
      // Build results lookup
      const resultsByRaceAndDriver: Record<string, {
        finish_position: number;
        stage_1_winner: boolean;
        stage_2_winner: boolean;
        stage_3_winner: boolean;
        most_laps_led: boolean;
      }> = {};

      for (const result of chartRaceResults) {
        const key = `${result.race_id}-${result.driver_id}`;
        resultsByRaceAndDriver[key] = {
          finish_position: result.finish_position,
          stage_1_winner: result.stage_1_winner || false,
          stage_2_winner: result.stage_2_winner || false,
          stage_3_winner: result.stage_3_winner || false,
          most_laps_led: result.most_laps_led || false,
        };
      }

      const CHART_POSITION_POINTS: Record<number, number> = getPositionPoints(config);

      // Group picks by race and calculate points
      const scoresByRace: Record<number, { raceName: string; raceId: string; scores: { teamId: string; points: number }[] }> = {};

      for (const pick of regularChartPicks) {
        const race = pick.race as unknown as { id: string; race_number: number; name: string };
        if (!race) continue;
        const raceNum = race.race_number;

        if (!scoresByRace[raceNum]) {
          scoresByRace[raceNum] = { raceName: race.name || `Race ${raceNum}`, raceId: race.id, scores: [] };
        }

        // Calculate points for this pick
        const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
        let racePoints = 0;
        let stageBonus = 0;
        let lapsLedBonus = 0;
        let allTop10 = true;

        for (const driverId of driverIds) {
          const key = `${race.id}-${driverId}`;
          const result = resultsByRaceAndDriver[key];

          if (result) {
            racePoints += CHART_POSITION_POINTS[result.finish_position] || 0;
            if (result.stage_1_winner) stageBonus += getStage1BonusPoints(config);
            if (result.stage_2_winner) stageBonus += getStage2BonusPoints(config);
            if (result.stage_3_winner) stageBonus += getStage3BonusPoints(config);
            if (result.most_laps_led && lapsLedBonus === 0) lapsLedBonus = getLapsLedBonusPoints(config);
            if (result.finish_position > 10) allTop10 = false;
          } else {
            allTop10 = false;
          }
        }

        if (allTop10 && driverIds.every(id => id)) racePoints += getTop10AllDriversBonusPoints(config);
        const totalPoints = racePoints + stageBonus + lapsLedBonus;

        scoresByRace[raceNum].scores.push({
          teamId: pick.team_id,
          points: totalPoints,
        });
      }

      // Build cumulative data
      const sortedRaceNums = Object.keys(scoresByRace).map(Number).sort((a, b) => a - b);

      for (const raceNum of sortedRaceNums) {
        const raceData = scoresByRace[raceNum];
        const dataPoint: ChartRaceData = {
          raceNumber: raceNum,
          raceName: raceData.raceName,
        };

        for (const { teamId, points } of raceData.scores) {
          cumulativeByTeam[teamId] = (cumulativeByTeam[teamId] || 0) + points;
        }

        for (const teamId in cumulativeByTeam) {
          dataPoint[teamId] = cumulativeByTeam[teamId];
        }

        chartData.push(dataPoint);
      }
    }
  }

  // Get all teams for the chart
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, abbreviation, car_number')
    .order('car_number', { ascending: true });

  const chartTeams = (allTeams || []).map(team => ({
    teamId: team.id,
    teamName: team.name,
    abbreviation: team.abbreviation,
    carNumber: team.car_number,
    color: '',
  }));

  // Helper for playoff round label
  const getPlayoffRoundLabel = (round: string) => {
    switch (round) {
      case 'not_started': return 'Playoffs Not Started';
      case 'round1': return 'Round 1';
      case 'round2': return 'Round 2';
      case 'finals': return 'Finals';
      case 'complete': return 'Season Complete';
      default: return round;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header - title hidden on mobile, season selector always visible */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="hidden sm:block">
          <h1 className="text-3xl font-bold text-white">Standings</h1>
          <p className="text-purple-400 mt-1">
            {selectedSeason?.name || 'No active season'} • {completedRegularRaces} of {totalRegularRaces} regular season races
          </p>
        </div>
        {seasons.length > 0 && selectedSeasonId && (
          <SeasonSelector
            seasons={seasons}
            currentSeasonId={selectedSeasonId}
            basePath="/standings"
          />
        )}
      </div>

      {/* Playoff Section - Shown FIRST when playoffs are active */}
      {showPlayoffSection && playoffStandings && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Fantasy Playoffs
            </h2>
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium">
              {getPlayoffRoundLabel(playoffStandings.playoffRound)} &bull; {completedPlayoffRaces} of {playoffRaces.length} races
            </span>
          </div>

          {/* Playoff Bracket Component */}
          <PlayoffBracket
            playoffStandings={playoffStandings}
            regularSeasonStandings={regularSeasonStandings}
            userTeamId={userTeamId}
            playoffOpts={playoffOpts}
            completedPlayoffRaces={completedPlayoffRaces}
            totalPlayoffRaces={playoffRaces.length}
          />

          {/* Consolation Bracket */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="bg-purple-600/20 px-4 py-3 border-b border-purple-500/30">
              <h3 className="text-lg font-bold text-purple-300">Consolation Bracket</h3>
              <p className="text-sm text-purple-400">Teams {playoffOpts.consolationStart}-{playoffOpts.consolationEnd} + eliminated championship teams (cumulative scoring)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right">Race Wins</th>
                  </tr>
                </thead>
                <tbody>
                  {playoffStandings.consolationBracket.map((standing) => {
                    const isUserTeam = standing.team_id === userTeamId;
                    const wasEliminated = playoffStandings.championshipBracket.eliminated.includes(standing.team_id);

                    return (
                      <tr
                        key={standing.team_id}
                        className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                          isUserTeam ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <span className="font-bold text-lg text-purple-400">{standing.rank}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/teams/${standing.team_id}`}
                            className="flex items-center space-x-3 hover:text-amber-400 transition-colors"
                          >
                            <span className="text-amber-400 font-bold">#{standing.team?.car_number}</span>
                            <span className="text-white font-medium">{standing.team?.name}</span>
                            {isUserTeam && (
                              <span className="text-xs bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 px-2 py-0.5 rounded font-bold">
                                YOU
                              </span>
                            )}
                            {wasEliminated && (
                              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                                from Champ
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-white font-bold">{standing.total_points}</span>
                        </td>
                        <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {playoffStandings.consolationBracket.length === 0 && (
              <div className="p-4 text-center text-purple-400 text-sm">
                Consolation bracket standings will appear when playoff races are complete.
              </div>
            )}
          </div>

          {/* Muddy Mile - only show if configured */}
          {playoffOpts.muddyMileStart > 0 && playoffOpts.muddyMileEnd > 0 && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30">
              <h3 className="text-lg font-bold text-red-400">The Muddy Mile</h3>
              <p className="text-sm text-purple-400">Teams {playoffOpts.muddyMileStart}-{playoffOpts.muddyMileEnd} battle to avoid last place (cumulative scoring)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-right">Race Wins</th>
                    <th className="px-4 py-3 text-center">Stakes</th>
                  </tr>
                </thead>
                <tbody>
                  {playoffStandings.muddyMile.map((standing, index) => {
                    const isUserTeam = standing.team_id === userTeamId;
                    const isLeading = index === 0 && standing.total_points > (playoffStandings.muddyMile[1]?.total_points || 0);

                    return (
                      <tr
                        key={standing.team_id}
                        className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                          isUserTeam ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <span className="font-bold text-lg text-red-400">{standing.rank}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/teams/${standing.team_id}`}
                            className="flex items-center space-x-3 hover:text-amber-400 transition-colors"
                          >
                            <span className="text-amber-400 font-bold">#{standing.team?.car_number}</span>
                            <span className="text-white font-medium">{standing.team?.name}</span>
                            {isUserTeam && (
                              <span className="text-xs bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 px-2 py-0.5 rounded font-bold">
                                YOU
                              </span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-white font-bold">{standing.total_points}</span>
                        </td>
                        <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                        <td className="px-4 py-4 text-center">
                          {playoffStandings.playoffRound === 'complete' ? (
                            index === 0 ? (
                              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded">+1 Bonus Use</span>
                            ) : (
                              <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">-1 Use (4 max)</span>
                            )
                          ) : (
                            <span className="text-purple-400 text-xs">
                              {isLeading ? '→ +1 Bonus' : '→ Forfeit 5th'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {playoffStandings.muddyMile.length === 0 && (
              <div className="p-4 text-center text-purple-400 text-sm">
                Muddy Mile standings will appear when playoff races are complete.
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Cumulative Points Chart (Regular Season Only) */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Regular Season Progress</h2>
        <CumulativePointsChart
          data={chartData}
          teams={chartTeams}
          userTeamId={userTeamId}
        />
      </div>

      {/* Regular Season Standings Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="bg-purple-900/50 px-4 py-3 border-b border-purple-700/30">
          <h2 className="text-lg font-bold text-white">Regular Season Standings</h2>
          <p className="text-sm text-purple-400">
            {completedRegularRaces === totalRegularRaces && totalRegularRaces > 0
              ? 'Final standings'
              : `${completedRegularRaces} of ${totalRegularRaces} races complete`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3 text-right">Race Wins</th>
                <th className="px-4 py-3 text-right">Stage Wins</th>
                <th className="px-4 py-3 text-right">Top 10 Bonus</th>
              </tr>
            </thead>
            <tbody>
              {regularSeasonStandings?.map((standing: any, index: number) => {
                const rank = standing.rank || index + 1;
                const isUserTeam = standing.team_id === userTeamId;

                let statusColor = 'border-purple-600';
                let rankColor = 'text-purple-400';
                let statusLabel = '';

                if (rank <= 2) {
                  statusColor = 'border-amber-400 border-l-[6px]';
                  rankColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300';
                  statusLabel = '🐱 Catbird Seat';
                } else if (rank <= 6) {
                  statusColor = 'border-emerald-500';
                  rankColor = 'text-emerald-400';
                } else if (rank === 7) {
                  statusColor = 'border-amber-400';
                  rankColor = 'text-amber-400';
                  statusLabel = '🐶 Lucky Dog';
                } else if (rank >= 16) {
                  statusColor = 'border-red-500';
                  rankColor = 'text-red-400';
                  statusLabel = '💩 Muddy Mile';
                }

                return (
                  <tr
                    key={standing.id}
                    className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                      isUserTeam ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <td className={`px-4 py-4 border-l-4 ${statusColor}`}>
                      <span className={`font-bold text-lg ${rankColor}`}>{rank}</span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/teams/${standing.team_id}`}
                        className="flex items-center space-x-3 hover:text-amber-400 transition-colors"
                      >
                        <span className="text-amber-400 font-bold">
                          #{standing.team?.car_number}
                        </span>
                        <span className="text-white font-medium hidden sm:inline">{standing.team?.name}</span>
                        <span className="text-white font-medium sm:hidden">{standing.team?.abbreviation || standing.team?.name}</span>
                        {isUserTeam && (
                          <span className="text-xs bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 px-2 py-0.5 rounded font-bold">
                            YOU
                          </span>
                        )}
                        {statusLabel && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            rank <= 2 ? 'bg-amber-500/20 text-amber-400' :
                            rank === 7 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {statusLabel}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-white font-bold text-lg">{standing.total_points}</span>
                    </td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.stage_wins}</td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.top_10_bonuses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(!regularSeasonStandings || regularSeasonStandings.length === 0) && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-purple-300">No standings data available yet.</p>
          <p className="text-purple-500 text-sm mt-2">
            Standings will appear after the first race results are entered.
          </p>
        </div>
      )}

      {/* Championship Picks */}
      {allChampionshipPicks.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-3">Championship Picks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allChampionshipPicks.map((pick) => (
              <Link
                key={pick.team_id}
                href={`/teams/${pick.team_id}`}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  pick.team_id === userTeamId
                    ? 'bg-amber-500/20 border border-amber-500/50'
                    : 'bg-purple-900/30 hover:bg-purple-800/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-sm">#{pick.car_number}</span>
                  <span className={`text-sm ${pick.team_id === userTeamId ? 'text-white font-medium' : 'text-purple-200'}`}>
                    {pick.team_name}
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm font-medium">
                  #{pick.driver_number} {pick.driver_name.split(' ').pop()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Scoring System */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Scoring System</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Position Points */}
          <div>
            <h3 className="text-sm font-medium text-purple-300 mb-2">Position Points</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {config?.position_points ? (
                Object.entries(config.position_points)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([pos, pts]) => (
                    <span key={pos} className="px-2 py-1 bg-purple-900/30 rounded text-purple-200">
                      P{pos}: <span className="text-white font-medium">{pts}</span>
                    </span>
                  ))
              ) : (
                <>
                  <span className="px-2 py-1 bg-purple-900/30 rounded text-purple-200">P1: <span className="text-white font-medium">10</span></span>
                  <span className="px-2 py-1 bg-purple-900/30 rounded text-purple-200">P2: <span className="text-white font-medium">9</span></span>
                  <span className="px-2 py-1 bg-purple-900/30 rounded text-purple-200">P3: <span className="text-white font-medium">8</span></span>
                  <span className="text-purple-400">... down to P10: 1</span>
                </>
              )}
            </div>
          </div>

          {/* Bonus Points */}
          <div>
            <h3 className="text-sm font-medium text-purple-300 mb-2">Bonus Points</h3>
            <div className="space-y-1 text-sm text-purple-200">
              <div>Stage 1 Win: <span className="text-amber-400 font-medium">+{config?.stage_1_bonus ?? 1}</span></div>
              <div>Stage 2 Win: <span className="text-amber-400 font-medium">+{config?.stage_2_bonus ?? 1}</span></div>
              <div>Stage 3 Win: <span className="text-amber-400 font-medium">+{config?.stage_3_bonus ?? 1}</span></div>
              <div>Most Laps Led: <span className="text-amber-400 font-medium">+{config?.laps_led_bonus ?? 1}</span></div>
              <div>All 3 Drivers Top 10: <span className="text-amber-400 font-medium">+{config?.top_10_all_drivers_bonus ?? 1}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Tiebreaker Info */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Tiebreakers</h2>
        <ol className="list-decimal list-inside text-purple-300 space-y-1 text-sm">
          {tiebreakerOrder.map((tiebreaker, index) => (
            <li key={tiebreaker}>{tiebreakerLabels[tiebreaker] || tiebreaker}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
