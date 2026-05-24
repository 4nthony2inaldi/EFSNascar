'use client';

import { useMemo, useState } from 'react';
import type { Driver, Team, Pick } from '@/types';
import { PickStrategyBadge } from '@/components/PickStrategyBadge';
import type { PickStrategy } from '@/lib/pickStrategy';

type SortMode = 'strategy' | 'standings';

interface TeamWithMeta {
  id: string;
  name: string;
  car_number: number;
}

interface Props {
  teams: TeamWithMeta[];
  teamPicks: Record<string, Pick>;
  teamStrategies: Record<string, PickStrategy>;
  driverMap: Record<string, Driver>;
  driverPickCounts: Record<string, number>;
  zigByTeam: Record<string, number>;
  standingsPointsByTeam: Record<string, number>;
  userTeamId: string | null;
  totalTeamsWithPicks: number;
}

function getPopularityColor(count: number, totalTeams: number): string {
  if (totalTeams === 0) return 'bg-gray-500/30 text-gray-300';
  const percentage = (count / totalTeams) * 100;
  if (count === 1) return 'bg-green-700 text-white border-green-500 font-semibold';
  if (percentage <= 20) return 'bg-green-500/30 text-green-300 border-green-400/50';
  if (percentage <= 35) return 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50';
  if (percentage <= 50) return 'bg-orange-500/30 text-orange-300 border-orange-500/50';
  if (percentage <= 70) return 'bg-red-400/30 text-red-300 border-red-400/50';
  return 'bg-red-700/40 text-red-300 border-red-700/50';
}

export function PicksAtAGlanceTable({
  teams,
  teamPicks,
  teamStrategies,
  driverMap,
  driverPickCounts,
  zigByTeam,
  standingsPointsByTeam,
  userTeamId,
  totalTeamsWithPicks,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('strategy');

  const sortedTeams = useMemo(() => {
    const arr = [...teams];
    if (sortMode === 'strategy') {
      arr.sort((a, b) => {
        const sa = teamStrategies[a.id];
        const sb = teamStrategies[b.id];
        if (!sa && !sb) return a.car_number - b.car_number;
        if (!sa) return 1;
        if (!sb) return -1;
        if (sa.intensity !== sb.intensity) return sa.intensity - sb.intensity;
        return a.car_number - b.car_number;
      });
    } else {
      arr.sort((a, b) => {
        const pa = standingsPointsByTeam[a.id] ?? -1;
        const pb = standingsPointsByTeam[b.id] ?? -1;
        if (pa === -1 && pb === -1) return a.car_number - b.car_number;
        if (pa === -1) return 1;
        if (pb === -1) return -1;
        if (pa !== pb) return pb - pa;
        return a.car_number - b.car_number;
      });
    }
    return arr;
  }, [teams, sortMode, teamStrategies, standingsPointsByTeam]);

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
    <div className="glass rounded-xl p-3 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2 sm:mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white">All Picks At A Glance</h2>
        <div className="inline-flex rounded-lg border border-purple-700/40 overflow-hidden text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setSortMode('strategy')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              sortMode === 'strategy'
                ? 'bg-amber-400 text-purple-900'
                : 'bg-purple-900/30 text-purple-300 hover:bg-purple-800/40'
            }`}
          >
            Strategy
          </button>
          <button
            type="button"
            onClick={() => setSortMode('standings')}
            className={`px-3 py-1.5 font-medium transition-colors ${
              sortMode === 'standings'
                ? 'bg-amber-400 text-purple-900'
                : 'bg-purple-900/30 text-purple-300 hover:bg-purple-800/40'
            }`}
          >
            Standings
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-purple-400 text-xs sm:text-sm border-b border-purple-700/30">
              <th className="pb-2 sm:pb-3 pr-2 sm:pr-4 whitespace-nowrap">Team</th>
              {sortMode === 'strategy' ? (
                <>
                  <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Zig %</th>
                  <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Strategy</th>
                </>
              ) : (
                <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Points</th>
              )}
              <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Driver 1</th>
              <th className="pb-2 sm:pb-3 pr-1 sm:pr-4 text-center">Driver 2</th>
              <th className="pb-2 sm:pb-3 text-center">Driver 3</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team) => {
              const pick = teamPicks[team.id];
              const isUserTeam = team.id === userTeamId;
              const colsAfterTeam = sortMode === 'strategy' ? 5 : 4;

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
                      {sortMode === 'strategy' ? (
                        <>
                          <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">
                            {(() => {
                              const zigPct = zigByTeam[team.id] ?? 0;
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
                        </>
                      ) : (
                        <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">
                          <span className="text-white font-bold text-xs sm:text-sm">
                            {standingsPointsByTeam[team.id] ?? 0}
                          </span>
                        </td>
                      )}
                      <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">{renderDriverCell(pick.driver_1_id)}</td>
                      <td className="py-1 sm:py-2 pr-1 sm:pr-4 text-center">{renderDriverCell(pick.driver_2_id)}</td>
                      <td className="py-1 sm:py-2 text-center">{renderDriverCell(pick.driver_3_id)}</td>
                    </>
                  ) : (
                    <td colSpan={colsAfterTeam} className="py-1 sm:py-2 text-center text-red-400 text-xs sm:text-sm">
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
  );
}
