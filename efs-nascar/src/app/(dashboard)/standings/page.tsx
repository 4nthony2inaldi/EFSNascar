import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Standing, Team, Season } from '@/types';
import { SeasonSelector, SEASON_COOKIE_NAME } from '@/components/SeasonSelector';
import { CumulativePointsChart } from '@/components/CumulativePointsChart';

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

  // Get all standings for selected season
  let { data: standings } = await supabase
    .from('standings')
    .select('*, team:teams(*)')
    .eq('season_id', selectedSeasonId)
    .is('race_id', null) // Season totals
    .order('rank', { ascending: true });

  // Check if standings have meaningful data (at least one team with points)
  const hasStandingsData = standings && standings.length > 0 &&
    standings.some((s: any) => s.total_points > 0);

  // If no pre-calculated standings OR standings have no points, calculate from race_scores
  if (!hasStandingsData) {
    // Get all race scores for the selected season
    const { data: raceScores } = await supabase
      .from('race_scores')
      .select('*, team:teams(*), race:races!inner(season_id)')
      .eq('race.season_id', selectedSeasonId);

    if (raceScores && raceScores.length > 0) {
      // Aggregate scores by team
      const teamTotals: Record<string, {
        team_id: string;
        team: any;
        total_points: number;
        race_wins: number;
        stage_wins: number;
        top_10_bonuses: number;
        laps_led_bonuses: number;
      }> = {};

      for (const score of raceScores) {
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
        // Stage bonus of 1 = 1 stage win, 2 = 2 stage wins
        teamTotals[score.team_id].stage_wins += score.stage_bonus || 0;
        // Check if any driver got position 1 (10 points)
        if (score.driver_1_points === 10 || score.driver_2_points === 10 || score.driver_3_points === 10) {
          teamTotals[score.team_id].race_wins += 1;
        }
      }

      // Convert to array and sort by points
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
    } else {
      // Third fallback: Calculate from picks + race_results directly
      // Get all picks for races in the selected season
      const { data: picks } = await supabase
        .from('picks')
        .select('*, team:teams(*), race:races!inner(season_id)')
        .eq('race.season_id', selectedSeasonId);

      // Get all race results for the selected season
      const { data: raceResults } = await supabase
        .from('race_results')
        .select('*, race:races!inner(season_id)')
        .eq('race.season_id', selectedSeasonId);

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

        // Position points lookup
        const POSITION_POINTS: Record<number, number> = {
          1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
        };

        // Calculate scores for each team
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
              // Position points
              const posPoints = POSITION_POINTS[result.finish_position] || 0;
              racePoints += posPoints;

              // Check for race win
              if (result.finish_position === 1) {
                teamTotals[pick.team_id].race_wins += 1;
              }

              // Stage wins
              if (result.stage_1_winner) {
                stageBonus += 1;
                teamTotals[pick.team_id].stage_wins += 1;
              }
              if (result.stage_2_winner) {
                stageBonus += 1;
                teamTotals[pick.team_id].stage_wins += 1;
              }

              // Laps led
              if (result.most_laps_led && lapsLedBonus === 0) {
                lapsLedBonus = 1;
                teamTotals[pick.team_id].laps_led_bonuses += 1;
              }

              // Check top 10
              if (result.finish_position > 10) {
                allTop10 = false;
              }
            } else {
              allTop10 = false;
            }
          }

          // Top 10 bonus
          if (allTop10) {
            racePoints += 1;
            teamTotals[pick.team_id].top_10_bonuses += 1;
          }

          teamTotals[pick.team_id].total_points += racePoints + stageBonus + lapsLedBonus;
        }

        // Convert to array and sort by points
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
    }
  }

  // Get completed races count for selected season
  const { count: completedRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', selectedSeasonId)
    .eq('status', 'final');

  // Fetch race-by-race scores for cumulative points chart
  const { data: raceScoresForChart } = await supabase
    .from('race_scores')
    .select('team_id, total_points, race:races!inner(id, race_number, name, season_id)')
    .eq('race.season_id', selectedSeasonId)
    .order('race(race_number)', { ascending: true });

  // Get all teams for the chart
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, abbreviation, car_number')
    .order('car_number', { ascending: true });

  // Build cumulative points data for chart
  interface ChartRaceData {
    raceNumber: number;
    raceName: string;
    [teamId: string]: number | string;
  }

  const chartData: ChartRaceData[] = [];
  const cumulativeByTeam: Record<string, number> = {};

  if (raceScoresForChart && raceScoresForChart.length > 0) {
    // Group scores by race
    const scoresByRace: Record<number, { raceName: string; scores: { teamId: string; points: number }[] }> = {};

    for (const score of raceScoresForChart) {
      const race = score.race as unknown as { id: string; race_number: number; name: string; season_id: string };
      if (!race) continue;
      const raceNum = race.race_number;

      if (!scoresByRace[raceNum]) {
        scoresByRace[raceNum] = { raceName: race.name, scores: [] };
      }
      scoresByRace[raceNum].scores.push({
        teamId: score.team_id,
        points: score.total_points || 0,
      });
    }

    // Sort by race number and build cumulative data
    const sortedRaceNums = Object.keys(scoresByRace).map(Number).sort((a, b) => a - b);

    for (const raceNum of sortedRaceNums) {
      const raceData = scoresByRace[raceNum];
      const dataPoint: ChartRaceData = {
        raceNumber: raceNum,
        raceName: raceData.raceName,
      };

      // Update cumulative totals for each team
      for (const { teamId, points } of raceData.scores) {
        cumulativeByTeam[teamId] = (cumulativeByTeam[teamId] || 0) + points;
      }

      // Add all team cumulative totals to data point
      for (const teamId in cumulativeByTeam) {
        dataPoint[teamId] = cumulativeByTeam[teamId];
      }

      chartData.push(dataPoint);
    }
  } else {
    // Fallback: Calculate chart data from picks + race_results
    const { data: chartPicks } = await supabase
      .from('picks')
      .select('team_id, driver_1_id, driver_2_id, driver_3_id, race:races!inner(id, race_number, name, season_id)')
      .eq('race.season_id', selectedSeasonId);

    const { data: chartRaceResults } = await supabase
      .from('race_results')
      .select('race_id, driver_id, finish_position, stage_1_winner, stage_2_winner, most_laps_led')
      .in('race_id', chartPicks?.map(p => (p.race as any)?.id).filter(Boolean) || []);

    if (chartPicks && chartPicks.length > 0 && chartRaceResults && chartRaceResults.length > 0) {
      // Build results lookup
      const resultsByRaceAndDriver: Record<string, {
        finish_position: number;
        stage_1_winner: boolean;
        stage_2_winner: boolean;
        most_laps_led: boolean;
      }> = {};

      for (const result of chartRaceResults) {
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

      // Group picks by race and calculate points
      const scoresByRace: Record<number, { raceName: string; raceId: string; scores: { teamId: string; points: number }[] }> = {};

      for (const pick of chartPicks) {
        const race = pick.race as unknown as { id: string; race_number: number; name: string };
        if (!race) continue;
        const raceNum = race.race_number;

        if (!scoresByRace[raceNum]) {
          scoresByRace[raceNum] = { raceName: race.name, raceId: race.id, scores: [] };
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
            racePoints += POSITION_POINTS[result.finish_position] || 0;
            if (result.stage_1_winner) stageBonus += 1;
            if (result.stage_2_winner) stageBonus += 1;
            if (result.most_laps_led && lapsLedBonus === 0) lapsLedBonus = 1;
            if (result.finish_position > 10) allTop10 = false;
          } else {
            allTop10 = false;
          }
        }

        if (allTop10) racePoints += 1;
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

  // Build teams array for chart
  const chartTeams = (allTeams || []).map(team => ({
    teamId: team.id,
    teamName: team.name,
    abbreviation: team.abbreviation,
    carNumber: team.car_number,
    color: '', // Will use default colors
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Standings</h1>
          <p className="text-purple-400 mt-1">
            {selectedSeason?.name || 'No active season'} • {completedRaces || 0} races completed
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

      {/* Cumulative Points Chart */}
      <CumulativePointsChart
        data={chartData}
        teams={chartTeams}
        userTeamId={userTeamId}
      />

      {/* Standings Table */}
      <div className="glass rounded-xl overflow-hidden">
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
              {standings?.map((standing: Standing & { team: Team }, index: number) => {
                const rank = standing.rank || index + 1;
                const isUserTeam = standing.team_id === userTeamId;

                // Determine playoff status color and labels
                let statusColor = 'border-purple-600';
                let rankColor = 'text-purple-400';
                let statusLabel = '';

                if (rank <= 2) {
                  // Catbird Seats - First Round Bye
                  statusColor = 'border-amber-400 border-l-[6px]';
                  rankColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300';
                  statusLabel = '🐱 Catbird Seat';
                } else if (rank <= 6) {
                  // Playoff Position
                  statusColor = 'border-emerald-500';
                  rankColor = 'text-emerald-400';
                } else if (rank === 7) {
                  // Lucky Dog
                  statusColor = 'border-amber-400';
                  rankColor = 'text-amber-400';
                  statusLabel = '🐶 Lucky Dog';
                } else if (rank >= 16) {
                  // Muddy Mile
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
                        {/* Show abbreviation on mobile, full name on larger screens */}
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

      {(!standings || standings.length === 0) && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-purple-300">No standings data available yet.</p>
          <p className="text-purple-500 text-sm mt-2">
            Standings will appear after the first race results are entered.
          </p>
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
