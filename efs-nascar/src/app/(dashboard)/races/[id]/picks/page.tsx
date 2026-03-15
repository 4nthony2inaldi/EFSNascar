import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Driver, Team, Pick, Race } from '@/types';
import { calculateDriverTiers } from '@/lib/driverTiers';
import { getPickStrategy, type PickStrategy } from '@/lib/pickStrategy';
import { PickStrategyBadge, PickStrategyLegend } from '@/components/PickStrategyBadge';
import { LocalTime } from '@/components/LocalTime';
import { RaceNavigation } from '@/components/RaceNavigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Get popularity color based on how many teams picked this driver
function getPopularityColor(count: number, totalTeams: number): string {
  if (totalTeams === 0) return 'bg-gray-500/30 text-gray-300';

  const percentage = (count / totalTeams) * 100;

  if (count === 1) return 'bg-green-700 text-white border-green-500 font-semibold'; // Unique - Solid dark green
  if (percentage <= 20) return 'bg-green-500/30 text-green-300 border-green-400/50'; // Rare - Light green
  if (percentage <= 35) return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50'; // Uncommon - Yellow
  if (percentage <= 50) return 'bg-orange-500/30 text-orange-300 border-orange-500/50'; // Common - Orange
  if (percentage <= 70) return 'bg-red-400/30 text-red-300 border-red-400/50'; // Popular - Light red
  return 'bg-red-700/40 text-red-300 border-red-700/50'; // Chalk - Dark red
}

function getPopularityLabel(count: number, totalTeams: number): string {
  if (totalTeams === 0) return '';

  const percentage = (count / totalTeams) * 100;

  if (count === 1) return 'Unique';
  if (percentage <= 20) return 'Rare';
  if (percentage <= 35) return 'Uncommon';
  if (percentage <= 50) return 'Common';
  if (percentage <= 70) return 'Popular';
  return 'Chalk';
}

// Calculate Zig % (contrarian score) for a pick based on driver popularity
function getZigPercent(driverIds: string[], driverPickCounts: Record<string, number>, totalTeams: number): number {
  if (totalTeams === 0) return 0;

  const zigWeights: Record<string, number> = {
    unique: 100,
    rare: 80,
    uncommon: 60,
    common: 40,
    popular: 20,
    chalk: 0,
  };

  let totalWeight = 0;
  for (const driverId of driverIds) {
    const count = driverPickCounts[driverId] || 0;
    const label = getPopularityLabel(count, totalTeams).toLowerCase();
    totalWeight += zigWeights[label] || 0;
  }

  return Math.round(totalWeight / driverIds.length);
}

export default async function PicksRevealPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get race details
  const { data: race, error } = await supabase
    .from('races')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !race) {
    notFound();
  }

  // Get all races for the season to calculate fantasy race number
  const { data: seasonRaces } = await supabase
    .from('races')
    .select('id')
    .eq('season_id', race.season_id)
    .order('race_number', { ascending: true });

  // Fantasy race number is the 1-based index in the season
  const fantasyRaceNumber = seasonRaces ? seasonRaces.findIndex(r => r.id === id) + 1 : race.race_number;

  // Check if deadline has passed
  const now = new Date();
  const deadline = new Date(race.deadline_datetime);
  const deadlinePassed = now > deadline;

  // If deadline hasn't passed, redirect to race page with message
  if (!deadlinePassed) {
    redirect(`/races/${id}?message=picks_hidden`);
  }

  // Get all drivers
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('*')
    .order('car_number');

  const driverMap: Record<string, Driver> = {};
  allDrivers?.forEach((d: Driver) => {
    driverMap[d.id] = d;
  });

  // Get all picks for this race with team info
  const { data: picks } = await supabase
    .from('picks')
    .select('*, team:teams(*)')
    .eq('race_id', id);

  // Get all teams to show who hasn't picked
  const { data: allTeams } = await supabase
    .from('teams')
    .select('*')
    .order('car_number');

  // Calculate driver tiers for strategy labels
  const driverTiers = await calculateDriverTiers(supabase);

  // Calculate driver popularity (how many teams picked each driver)
  const driverPickCounts: Record<string, number> = {};
  const teamPicks: Record<string, Pick & { team: Team }> = {};
  const teamStrategies: Record<string, PickStrategy> = {};

  picks?.forEach((pick: any) => {
    teamPicks[pick.team_id] = pick;
    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
      if (driverId) {
        driverPickCounts[driverId] = (driverPickCounts[driverId] || 0) + 1;
      }
    });

    // Calculate pick strategy for this team
    const tiers = [
      driverTiers.get(pick.driver_1_id) || 0,
      driverTiers.get(pick.driver_2_id) || 0,
      driverTiers.get(pick.driver_3_id) || 0,
    ];
    teamStrategies[pick.team_id] = getPickStrategy(tiers);
  });

  const totalTeamsWithPicks = picks?.length || 0;

  // Fetch race scores to check if results are in
  const { data: raceScores } = await supabase
    .from('race_scores')
    .select('*')
    .eq('race_id', id);

  // Create a map of team_id to total_points
  const teamScoresMap: Record<string, number> = {};
  raceScores?.forEach((score: any) => {
    teamScoresMap[score.team_id] = score.total_points;
  });
  const hasRaceResults = (raceScores?.length || 0) > 0;

  // Sort teams by pick intensity (ascending) for "picks at a glance"
  // Teams without picks go at the end
  const sortedTeamsByIntensity = [...(allTeams || [])].sort((a, b) => {
    const strategyA = teamStrategies[a.id];
    const strategyB = teamStrategies[b.id];

    // Teams without picks go at the end
    if (!strategyA && !strategyB) return a.car_number - b.car_number;
    if (!strategyA) return 1;
    if (!strategyB) return -1;

    // Sort by intensity ascending (lower = more aggressive)
    if (strategyA.intensity !== strategyB.intensity) {
      return strategyA.intensity - strategyB.intensity;
    }
    // Tie-breaker: car number
    return a.car_number - b.car_number;
  });

  // Sort teams by points (descending) when results are in, otherwise by intensity
  const sortedTeamsByPoints = [...(allTeams || [])].sort((a, b) => {
    const pointsA = teamScoresMap[a.id] ?? -1;
    const pointsB = teamScoresMap[b.id] ?? -1;

    // Teams without scores go at the end
    if (pointsA === -1 && pointsB === -1) return a.car_number - b.car_number;
    if (pointsA === -1) return 1;
    if (pointsB === -1) return -1;

    // Sort by points descending
    if (pointsA !== pointsB) {
      return pointsB - pointsA;
    }
    // Tie-breaker: car number
    return a.car_number - b.car_number;
  });

  // Get current user's team for highlighting
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user?.id || '')
    .single();
  const userTeamId = membership?.team_id;

  // Find most and least popular picks
  const sortedDriversByPopularity = Object.entries(driverPickCounts)
    .sort(([, a], [, b]) => b - a);

  const mostPopular = sortedDriversByPopularity.slice(0, 5);
  const uniquePicks = sortedDriversByPopularity.filter(([, count]) => count === 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <Link
                href={`/races/${id}`}
                className="text-purple-400 hover:text-purple-300 text-sm"
              >
                &larr; Back to Race
              </Link>
            </div>
            <p className="text-purple-400 text-sm">Race #{fantasyRaceNumber}</p>
            <h1 className="text-3xl font-bold text-white">{race.name}</h1>
            <p className="text-purple-300">{race.track}</p>
            <p className="text-sm text-purple-500 mt-2">
              <LocalTime dateStr={race.scheduled_datetime} format="full" />
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-amber-400">{totalTeamsWithPicks}</div>
            <div className="text-purple-400 text-sm">Teams Submitted</div>
          </div>
        </div>
      </div>

      {/* Race Navigation */}
      <RaceNavigation currentRace={race} basePath="picks" />

      {/* Pick Strategy Legend */}
      <PickStrategyLegend />

      {/* Pick Popularity Legend */}
      <div className="glass rounded-xl p-3 sm:p-6">
        <h2 className="text-sm sm:text-lg font-bold text-white mb-2 sm:mb-4">Pick Popularity</h2>
        <div className="flex flex-wrap gap-1.5 sm:gap-3">
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-green-700 text-white border-green-500 font-semibold">
            <span className="font-medium">Unique</span>
            <span className="hidden sm:inline text-xs opacity-75">(1 team)</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-green-500/30 text-green-300 border-green-400/50">
            <span className="font-medium">Rare</span>
            <span className="hidden sm:inline text-xs opacity-75">(&le;20%)</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-yellow-500/30 text-yellow-300 border-yellow-500/50">
            <span className="font-medium">Uncommon</span>
            <span className="hidden sm:inline text-xs opacity-75">(&le;35%)</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-orange-500/30 text-orange-300 border-orange-500/50">
            <span className="font-medium">Common</span>
            <span className="hidden sm:inline text-xs opacity-75">(&le;50%)</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-red-400/30 text-red-300 border-red-400/50">
            <span className="font-medium">Popular</span>
            <span className="hidden sm:inline text-xs opacity-75">(&le;70%)</span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 px-1.5 py-0.5 sm:px-3 sm:py-2 rounded border text-[10px] sm:text-sm bg-red-700/40 text-red-300 border-red-700/50">
            <span className="font-medium">Chalk</span>
            <span className="hidden sm:inline text-xs opacity-75">(&gt;70%)</span>
          </div>
        </div>
      </div>

      {/* Compact All Picks Table */}
      <div className="glass rounded-xl p-3 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-4">All Picks At A Glance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-purple-400 text-xs sm:text-sm border-b border-purple-700/30">
                <th className="pb-2 sm:pb-3 pr-2 sm:pr-4 whitespace-nowrap">Team</th>
                <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Zig %</th>
                <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Strategy</th>
                <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Driver 1</th>
                <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Driver 2</th>
                <th className="pb-2 sm:pb-3 text-center">Driver 3</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeamsByIntensity.map((team) => {
                const pick = teamPicks[team.id];
                const isUserTeam = team.id === userTeamId;

                const renderDriverCell = (driverId: string | undefined) => {
                  if (!driverId) return <span className="text-gray-500">-</span>;
                  const driver = driverMap[driverId];
                  if (!driver) return <span className="text-gray-500">-</span>;
                  const pickCount = driverPickCounts[driverId] || 0;

                  return (
                    <span className={`inline-block px-1 py-0.5 sm:px-2 sm:py-1 rounded text-xs sm:text-sm font-medium border ${getPopularityColor(pickCount, totalTeamsWithPicks)}`}>
                      <span className="sm:hidden">#{driver.car_number}</span>
                      <span className="hidden sm:inline">#{driver.car_number} {driver.name}</span>
                    </span>
                  );
                };

                return (
                  <tr
                    key={team.id}
                    className={`border-b border-purple-800/20 ${isUserTeam ? 'bg-amber-500/10' : ''}`}
                  >
                    <td className="py-1 sm:py-2 pr-2 sm:pr-4">
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <span className="text-amber-400 font-bold text-xs sm:text-base">#{team.car_number}</span>
                        <span className="text-white font-medium text-xs sm:text-base truncate max-w-[80px] sm:max-w-none">{team.name}</span>
                        {isUserTeam && (
                          <span className="text-[10px] sm:text-xs bg-amber-400 text-purple-900 px-1 sm:px-1.5 py-0.5 rounded font-bold">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    {pick ? (
                      <>
                        <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">
                          {(() => {
                            const zigPct = getZigPercent(
                              [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id],
                              driverPickCounts,
                              totalTeamsWithPicks
                            );
                            return (
                              <span className={`text-xs sm:text-sm font-bold ${
                                zigPct >= 60 ? 'text-green-400' :
                                zigPct >= 40 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {zigPct}%
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">
                          {teamStrategies[team.id] && (
                            <PickStrategyBadge strategy={teamStrategies[team.id]} size="sm" />
                          )}
                        </td>
                        <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">{renderDriverCell(pick.driver_1_id)}</td>
                        <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">{renderDriverCell(pick.driver_2_id)}</td>
                        <td className="py-1 sm:py-2 text-center">{renderDriverCell(pick.driver_3_id)}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-1 sm:py-2 text-center text-red-400 text-xs sm:text-sm">
                        No picks submitted
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Popular Picks */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Most Popular Picks</h2>
          <div className="space-y-2">
            {mostPopular.map(([driverId, count]) => {
              const driver = driverMap[driverId];
              if (!driver) return null;
              const percentage = Math.round((count / totalTeamsWithPicks) * 100);

              return (
                <div
                  key={driverId}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${getPopularityColor(count, totalTeamsWithPicks)}`}
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-amber-400">#{driver.car_number}</span>
                    <span className="font-medium">{driver.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold">{count}</span>
                    <span className="text-sm opacity-75 ml-1">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unique Picks */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">
            Unique Picks
            <span className="text-purple-400 text-sm font-normal ml-2">
              ({uniquePicks.length} driver{uniquePicks.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uniquePicks.length === 0 ? (
              <p className="text-purple-400 text-sm">No unique picks this week</p>
            ) : (
              uniquePicks.map(([driverId]) => {
                const driver = driverMap[driverId];
                if (!driver) return null;

                // Find which team made this unique pick
                const teamWithUniquePick = picks?.find((p: any) =>
                  p.driver_1_id === driverId ||
                  p.driver_2_id === driverId ||
                  p.driver_3_id === driverId
                );

                return (
                  <div
                    key={driverId}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border bg-green-800/40 text-green-300 border-green-700/50"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-amber-400">#{driver.car_number}</span>
                      <span className="font-medium">{driver.name}</span>
                    </div>
                    {teamWithUniquePick && (
                      <span className="text-sm opacity-75">
                        by #{teamWithUniquePick.team?.car_number}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* All Teams' Picks */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">
          All Teams&apos; Picks
          {hasRaceResults && (
            <span className="text-purple-400 text-sm font-normal ml-2">(sorted by points)</span>
          )}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {(hasRaceResults ? sortedTeamsByPoints : sortedTeamsByIntensity).map((team) => {
            const pick = teamPicks[team.id];
            const isUserTeam = team.id === userTeamId;
            const teamPoints = teamScoresMap[team.id];

            return (
              <div
                key={team.id}
                className={`rounded-xl p-4 border-2 transition-all ${
                  isUserTeam
                    ? 'bg-amber-500/10 border-amber-500/50'
                    : 'bg-[#1a1625] border-purple-700/30 hover:border-purple-600/50'
                }`}
              >
                {/* Team Header */}
                <div className="flex items-center justify-between mb-3">
                  <Link
                    href={`/teams/${team.id}`}
                    className="flex items-center space-x-2 hover:text-amber-400 transition-colors"
                  >
                    <span className="text-amber-400 font-bold text-lg">#{team.car_number}</span>
                    <span className="text-white font-medium">{team.name}</span>
                    {isUserTeam && (
                      <span className="text-xs bg-amber-400 text-purple-900 px-2 py-0.5 rounded font-bold">
                        YOU
                      </span>
                    )}
                  </Link>
                  <div className="flex items-center space-x-2">
                    {hasRaceResults && teamPoints !== undefined && (
                      <span className="text-lg font-bold text-amber-400">
                        {teamPoints} pts
                      </span>
                    )}
                    {teamStrategies[team.id] && (
                      <PickStrategyBadge strategy={teamStrategies[team.id]} size="sm" />
                    )}
                  </div>
                </div>

                {/* Picks */}
                {pick ? (
                  <div className="space-y-2">
                    {[pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].map((driverId, idx) => {
                      const driver = driverMap[driverId];
                      const pickCount = driverPickCounts[driverId] || 0;

                      if (!driver) {
                        return (
                          <div key={idx} className="px-3 py-2 rounded-lg bg-gray-700/30 text-gray-500">
                            Unknown Driver
                          </div>
                        );
                      }

                      return (
                        <div
                          key={driverId}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border ${getPopularityColor(pickCount, totalTeamsWithPicks)}`}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-bold">#{driver.car_number}</span>
                            <span className="font-medium truncate">{driver.name}</span>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-black/20">
                              {pickCount}/{totalTeamsWithPicks}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <span className="text-red-400 text-sm font-medium">No picks submitted</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Driver Popularity Table */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Full Driver Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-purple-400 text-sm border-b border-purple-700/30">
                <th className="pb-3 pr-4">#</th>
                <th className="pb-3 pr-4">Driver</th>
                <th className="pb-3 pr-4">Team</th>
                <th className="pb-3 text-center">Times Picked</th>
                <th className="pb-3 text-center">Percentage</th>
                <th className="pb-3 text-center">Popularity</th>
              </tr>
            </thead>
            <tbody>
              {sortedDriversByPopularity.map(([driverId, count]) => {
                const driver = driverMap[driverId];
                if (!driver) return null;

                const percentage = Math.round((count / totalTeamsWithPicks) * 100);
                const popularityLabel = getPopularityLabel(count, totalTeamsWithPicks);

                return (
                  <tr key={driverId} className="border-b border-purple-800/20">
                    <td className="py-3 pr-4 text-amber-400 font-bold">{driver.car_number}</td>
                    <td className="py-3 pr-4 text-white">{driver.name}</td>
                    <td className="py-3 pr-4 text-purple-300">{driver.team_name}</td>
                    <td className="py-3 text-center">
                      <span className="font-bold text-white">{count}</span>
                      <span className="text-purple-400 ml-1">/ {totalTeamsWithPicks}</span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="w-full bg-purple-900/30 rounded-full h-2 relative">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-400"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-purple-300">{percentage}%</span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getPopularityColor(count, totalTeamsWithPicks)}`}>
                        {popularityLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
