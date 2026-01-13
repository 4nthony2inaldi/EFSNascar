import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Standing, Team, Season, RaceType } from '@/types';
import { SeasonSelector, SEASON_COOKIE_NAME } from '@/components/SeasonSelector';
import { CumulativePointsChart } from '@/components/CumulativePointsChart';
import {
  calculatePlayoffStandings,
  isRegularSeasonComplete,
  havePlayoffsStarted,
  type PlayoffTeamStanding,
  type RaceScore,
} from '@/lib/playoff-standings';

// Force dynamic rendering to ensure cookies are read fresh
export const dynamic = 'force-dynamic';

interface StandingsPageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function StandingsPage({ searchParams }: StandingsPageProps) {
  const supabase = await createClient();
  const params = await searchParams;
  const cookieStore = await cookies();

  // Get current user's team
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user?.id)
    .single();
  const userTeamId = membership?.team_id;

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
  const selectedSeasonId = params.season || seasonCookie || activeSeason?.id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || activeSeason;

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

  // Calculate regular season standings
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
    if (score.driver_1_points === 10 || score.driver_2_points === 10 || score.driver_3_points === 10) {
      regularSeasonTotals[score.team_id].race_wins += 1;
    }
  }

  const regularSeasonStandings = Object.values(regularSeasonTotals)
    .sort((a, b) => b.total_points - a.total_points)
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

    playoffStandings = calculatePlayoffStandings(playoffTeamStandings, playoffRaceScores);
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
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
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

      {/* Standings Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full"></div>
          <span className="text-purple-300">Catbird Seats (1-2) - First Round Bye</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <span className="text-purple-300">Playoff Position (3-6)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
          <span className="text-purple-300">Lucky Dog (7th)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <span className="text-purple-300">Consolation (8-15)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-purple-300">Muddy Mile (16-17)</span>
        </div>
      </div>

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

      {/* Playoff Section */}
      {showPlayoffSection && playoffStandings && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Fantasy Playoffs
            </h2>
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium">
              {getPlayoffRoundLabel(playoffStandings.playoffRound)} • {completedPlayoffRaces} of {playoffRaces.length} races
            </span>
          </div>

          {/* Championship Bracket */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-4 py-3 border-b border-amber-500/30">
              <h3 className="text-lg font-bold text-amber-400">Championship Bracket</h3>
              <p className="text-sm text-purple-300">Top 7 teams competing for the championship (points reset each round)</p>
            </div>

            {/* Show current round standings */}
            {playoffStandings.playoffRound === 'not_started' && (
              <div className="p-6 text-center text-purple-400">
                <p>Playoffs begin after the regular season. Top 2 seeds will have a first round bye.</p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {playoffStandings.championshipBracket.catbirdSeats.map((teamId) => {
                    const team = regularSeasonStandings.find(s => s.team_id === teamId);
                    return team ? (
                      <div key={teamId} className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                        <span className="text-xs text-amber-400">🐱 Catbird Seat</span>
                        <div className="text-white font-medium">#{team.team?.car_number} {team.team?.name}</div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            {playoffStandings.playoffRound !== 'not_started' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-right">Points</th>
                      <th className="px-4 py-3 text-right">Race Wins</th>
                      <th className="px-4 py-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Determine which standings to show based on current round
                      let currentStandings: PlayoffTeamStanding[] = [];
                      let roundLabel = '';

                      if (playoffStandings.playoffRound === 'round1' || playoffStandings.playoffRound === 'round2') {
                        if (playoffStandings.championshipBracket.round2.length > 0) {
                          currentStandings = playoffStandings.championshipBracket.round2;
                          roundLabel = 'Round 2';
                        } else {
                          currentStandings = playoffStandings.championshipBracket.round1;
                          roundLabel = 'Round 1';
                        }
                      } else if (playoffStandings.playoffRound === 'finals' || playoffStandings.playoffRound === 'complete') {
                        currentStandings = playoffStandings.championshipBracket.finals;
                        roundLabel = 'Finals';
                      }

                      // Also include catbird seats in round 1 display
                      if (roundLabel === 'Round 1') {
                        const catbirdTeams = playoffStandings.championshipBracket.catbirdSeats.map(teamId => {
                          const team = regularSeasonStandings.find(s => s.team_id === teamId);
                          return team ? {
                            team_id: teamId,
                            team: team.team,
                            total_points: 0,
                            race_wins: 0,
                            stage_wins: 0,
                            top_10_bonuses: 0,
                            rank: 0,
                          } as PlayoffTeamStanding : null;
                        }).filter(Boolean) as PlayoffTeamStanding[];

                        // Prepend catbird seats with "BYE" status
                        return [...catbirdTeams, ...currentStandings].map((standing, index) => {
                          const isUserTeam = standing.team_id === userTeamId;
                          const isCatbird = playoffStandings.championshipBracket.catbirdSeats.includes(standing.team_id);
                          const isEliminated = playoffStandings.championshipBracket.eliminated.includes(standing.team_id);

                          return (
                            <tr
                              key={standing.team_id}
                              className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                                isUserTeam ? 'bg-amber-500/10' : ''
                              } ${isEliminated ? 'opacity-50' : ''}`}
                            >
                              <td className="px-4 py-4">
                                <span className="font-bold text-lg text-purple-400">
                                  {isCatbird ? '-' : standing.rank}
                                </span>
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
                                <span className="text-white font-bold">{isCatbird ? '-' : standing.total_points}</span>
                              </td>
                              <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                              <td className="px-4 py-4 text-center">
                                {isCatbird ? (
                                  <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded">🐱 BYE</span>
                                ) : isEliminated ? (
                                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">ELIMINATED</span>
                                ) : (
                                  <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded">ACTIVE</span>
                                )}
                              </td>
                            </tr>
                          );
                        });
                      }

                      return currentStandings.map((standing) => {
                        const isUserTeam = standing.team_id === userTeamId;
                        const isEliminated = playoffStandings.championshipBracket.eliminated.includes(standing.team_id);

                        return (
                          <tr
                            key={standing.team_id}
                            className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                              isUserTeam ? 'bg-amber-500/10' : ''
                            } ${isEliminated ? 'opacity-50' : ''}`}
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
                              </Link>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-white font-bold">{standing.total_points}</span>
                            </td>
                            <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                            <td className="px-4 py-4 text-center">
                              {isEliminated ? (
                                <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">ELIMINATED</span>
                              ) : playoffStandings.playoffRound === 'complete' && standing.rank === 1 ? (
                                <span className="px-2 py-1 bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 text-xs rounded font-bold">🏆 CHAMPION</span>
                              ) : (
                                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded">ACTIVE</span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Consolation Bracket */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="bg-purple-600/20 px-4 py-3 border-b border-purple-500/30">
              <h3 className="text-lg font-bold text-purple-300">Consolation Bracket</h3>
              <p className="text-sm text-purple-400">Teams 8-15 + eliminated championship teams (cumulative scoring)</p>
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

          {/* Muddy Mile */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="bg-red-500/20 px-4 py-3 border-b border-red-500/30">
              <h3 className="text-lg font-bold text-red-400">💩 The Muddy Mile</h3>
              <p className="text-sm text-purple-400">Bottom 2 teams battle to avoid last place (cumulative scoring)</p>
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
        </div>
      )}

      {/* Tiebreaker Info */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Tiebreakers</h2>
        <ol className="list-decimal list-inside text-purple-300 space-y-1 text-sm">
          <li>Most race winners picked</li>
          <li>Most stage winners picked</li>
          <li>Most &quot;all 3 in top 10&quot; bonuses</li>
          <li>All-Star race finish position</li>
        </ol>
      </div>
    </div>
  );
}
