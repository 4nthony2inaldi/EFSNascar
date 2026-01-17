'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RaceResult, Driver, ScoringConfig } from '@/types';
import { POSITION_POINTS } from '@/types';

type PopularityLevel = 'unique' | 'rare' | 'uncommon' | 'common' | 'popular' | 'chalk' | null;

interface TeamPicksTableProps {
  picks: any[];
  resultsMap: Record<string, RaceResult & { driver: Driver }>;
  driverPickCounts: Record<string, number>;
  userTeamId: string | null;
  scores: any[] | null;
  scoringConfig?: ScoringConfig | null;
}

// Get driver's last name only
function getLastName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  if (parts.length < 2) return fullName;
  return parts.slice(1).join(' ');
}

function getPopularityLevel(count: number, totalTeams: number): PopularityLevel {
  const percentage = (count / totalTeams) * 100;

  if (count === 1) return 'unique';
  if (percentage <= 20) return 'rare';
  if (percentage <= 35) return 'uncommon';
  if (percentage <= 50) return 'common';
  if (percentage <= 70) return 'popular';
  return 'chalk';
}

function getOverlapColor(count: number, totalTeams: number) {
  const percentage = (count / totalTeams) * 100;

  if (count === 1) return 'bg-green-800/40 text-green-300 border border-green-700/50'; // Unique
  if (percentage <= 20) return 'bg-green-500/30 text-green-300 border border-green-400/50'; // Rare
  if (percentage <= 35) return 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50'; // Uncommon
  if (percentage <= 50) return 'bg-orange-500/30 text-orange-300 border border-orange-500/50'; // Common
  if (percentage <= 70) return 'bg-red-400/30 text-red-300 border border-red-400/50'; // Popular
  return 'bg-red-700/40 text-red-300 border border-red-700/50'; // Chalk
}

function getPositionPoints(position: number, config?: ScoringConfig | null): number {
  if (config?.position_points) {
    return config.position_points[position.toString()] || 0;
  }
  return POSITION_POINTS[position] || 0;
}

function getStageBonus(result: any, config?: ScoringConfig | null): number {
  const s1 = result.stage_1_winner ? (config?.stage_1_bonus ?? 1) : 0;
  const s2 = result.stage_2_winner ? (config?.stage_2_bonus ?? 1) : 0;
  const s3 = result.stage_3_winner ? (config?.stage_3_bonus ?? 1) : 0;
  return s1 + s2 + s3;
}

function calculateDriverTotalPoints(result: any, config?: ScoringConfig | null) {
  const positionPoints = getPositionPoints(result.finish_position, config);
  const stageBonus = getStageBonus(result, config);
  const lapsLedBonus = result.most_laps_led ? (config?.laps_led_bonus ?? 1) : 0;
  return positionPoints + stageBonus + lapsLedBonus;
}

export function TeamPicksTable({ picks, resultsMap, driverPickCounts, userTeamId, scores, scoringConfig }: TeamPicksTableProps) {
  const [activeFilter, setActiveFilter] = useState<PopularityLevel>(null);
  const totalTeams = picks.length || 1;

  const handleFilterClick = (level: PopularityLevel) => {
    setActiveFilter(activeFilter === level ? null : level);
  };

  const isLegendActive = (level: PopularityLevel) => activeFilter === level;

  // Process picks with calculated totals
  const processedPicks = [...picks]
    .map((pick: any) => {
      const d1Result = resultsMap[pick.driver_1_id];
      const d2Result = resultsMap[pick.driver_2_id];
      const d3Result = resultsMap[pick.driver_3_id];
      const d1Points = d1Result ? calculateDriverTotalPoints(d1Result, scoringConfig) : 0;
      const d2Points = d2Result ? calculateDriverTotalPoints(d2Result, scoringConfig) : 0;
      const d3Points = d3Result ? calculateDriverTotalPoints(d3Result, scoringConfig) : 0;

      const allTop10 = d1Result && d2Result && d3Result &&
        d1Result.finish_position <= 10 &&
        d2Result.finish_position <= 10 &&
        d3Result.finish_position <= 10;
      const top10Bonus = allTop10 ? (scoringConfig?.top_10_all_drivers_bonus ?? 1) : 0;

      const calculatedTotal = d1Points + d2Points + d3Points + top10Bonus;
      return { ...pick, calculatedTotal };
    })
    .sort((a, b) => b.calculatedTotal - a.calculatedTotal);

  const renderDriver = (driverId: string) => {
    const result = resultsMap[driverId];
    const pickCount = driverPickCounts[driverId] || 0;

    if (!result) return <span className="text-gray-500">Unknown</span>;

    const totalPoints = calculateDriverTotalPoints(result, scoringConfig);
    const posPoints = getPositionPoints(result.finish_position, scoringConfig);
    const hasBonus = totalPoints > posPoints;
    const popularityLevel = getPopularityLevel(pickCount, totalTeams);
    const isHighlighted = activeFilter && popularityLevel === activeFilter;
    const isDimmed = activeFilter && popularityLevel !== activeFilter;
    const lastName = getLastName(result.driver?.name || '');

    return (
      <div className={`inline-flex items-center gap-1 md:gap-2 px-1 md:px-2 py-0.5 md:py-1 rounded transition-all duration-200 text-xs md:text-sm ${getOverlapColor(pickCount, totalTeams)} ${
        isHighlighted ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800 scale-105' : ''
      } ${isDimmed ? 'opacity-30' : ''}`}>
        {/* Car number hidden on mobile */}
        <span className="font-bold hidden md:inline">#{result.driver?.car_number}</span>
        {/* Full name on desktop, last name only on mobile with truncation */}
        <span className="hidden md:inline">{result.driver?.name}</span>
        <span className="md:hidden max-w-[70px] truncate">{lastName}</span>
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Team Picks</h2>

      {/* Pick Popularity Legend - Interactive */}
      <div className="bg-gray-900/50 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold text-white mb-2">Pick Popularity <span className="text-gray-400 font-normal">(click to filter)</span></h3>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            onClick={() => handleFilterClick('unique')}
            className={`px-2 py-1 rounded border bg-green-800/40 text-green-300 border-green-700/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('unique') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('unique') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Unique</span> <span className="opacity-75">(1 team)</span>
          </button>
          <button
            onClick={() => handleFilterClick('rare')}
            className={`px-2 py-1 rounded border bg-green-500/30 text-green-300 border-green-400/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('rare') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('rare') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Rare</span> <span className="opacity-75">(≤20%)</span>
          </button>
          <button
            onClick={() => handleFilterClick('uncommon')}
            className={`px-2 py-1 rounded border bg-yellow-500/30 text-yellow-300 border-yellow-500/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('uncommon') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('uncommon') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Uncommon</span> <span className="opacity-75">(≤35%)</span>
          </button>
          <button
            onClick={() => handleFilterClick('common')}
            className={`px-2 py-1 rounded border bg-orange-500/30 text-orange-300 border-orange-500/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('common') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('common') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Common</span> <span className="opacity-75">(≤50%)</span>
          </button>
          <button
            onClick={() => handleFilterClick('popular')}
            className={`px-2 py-1 rounded border bg-red-400/30 text-red-300 border-red-400/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('popular') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('popular') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Popular</span> <span className="opacity-75">(≤70%)</span>
          </button>
          <button
            onClick={() => handleFilterClick('chalk')}
            className={`px-2 py-1 rounded border bg-red-700/40 text-red-300 border-red-700/50 transition-all cursor-pointer hover:scale-105 ${
              isLegendActive('chalk') ? 'ring-2 ring-white' : ''
            } ${activeFilter && !isLegendActive('chalk') ? 'opacity-40' : ''}`}
          >
            <span className="font-medium">Chalk</span> <span className="opacity-75">(&gt;70%)</span>
          </button>
          {activeFilter && (
            <button
              onClick={() => setActiveFilter(null)}
              className="px-2 py-1 rounded border border-gray-500 text-gray-300 hover:bg-gray-700 transition-all"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-400 text-xs md:text-sm border-b border-gray-700">
              <th className="pb-3 pr-2 md:pr-4">Team</th>
              <th className="pb-3 pr-1 md:pr-4 text-center"><span className="hidden md:inline">Points</span><span className="md:hidden">Pts</span></th>
              <th className="pb-3 pr-1 md:pr-4"><span className="hidden md:inline">Driver 1</span><span className="md:hidden">D1</span></th>
              <th className="pb-3 pr-1 md:pr-4"><span className="hidden md:inline">Driver 2</span><span className="md:hidden">D2</span></th>
              <th className="pb-3"><span className="hidden md:inline">Driver 3</span><span className="md:hidden">D3</span></th>
            </tr>
          </thead>
          <tbody>
            {processedPicks.map((pick: any) => {
              const isUserTeam = pick.team_id === userTeamId;
              const teamScore = scores?.find((s: any) => s.team_id === pick.team_id);

              return (
                <tr
                  key={pick.id}
                  className={`border-b border-gray-700/50 ${isUserTeam ? 'bg-yellow-500/10' : ''}`}
                >
                  <td className="py-2 md:py-3 pr-2 md:pr-4">
                    <Link
                      href={`/teams/${pick.team_id}`}
                      className="flex items-center gap-1 md:gap-2 hover:text-yellow-500"
                    >
                      <span className="text-yellow-500 font-bold text-xs md:text-base">
                        #{pick.team?.car_number}
                      </span>
                      {/* Full name on desktop, abbreviated on mobile */}
                      <span className="text-white text-xs md:text-base hidden md:inline">{pick.team?.name}</span>
                      <span className="text-white text-xs md:hidden">{pick.team?.abbreviation || pick.team?.name?.split(' ')[0]}</span>
                    </Link>
                  </td>
                  <td className="py-2 md:py-3 pr-2 md:pr-4 text-center">
                    <span className="text-white font-bold text-sm md:text-lg">
                      {teamScore?.total_points ?? pick.calculatedTotal}
                    </span>
                  </td>
                  <td className="py-2 md:py-3 pr-1 md:pr-4">{renderDriver(pick.driver_1_id)}</td>
                  <td className="py-2 md:py-3 pr-1 md:pr-4">{renderDriver(pick.driver_2_id)}</td>
                  <td className="py-2 md:py-3">{renderDriver(pick.driver_3_id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
