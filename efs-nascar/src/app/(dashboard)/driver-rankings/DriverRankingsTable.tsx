'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';

export interface DriverStats {
  driver_name: string;
  car_numbers: number[];
  current_car_number: number;
  team_name: string | null;
  races: number;
  wins: number;
  stage_wins: number;
  laps_led_races: number;
  avg_finish: number;
  top_5s: number;
  top_10s: number;
  fantasy_points: number;
  weighted_fantasy_points: number;
  fantasy_points_per_race: number;
  weighted_fantasy_points_per_race: number;
  tier: number;
}

type SortKey = keyof DriverStats;
type SortDirection = 'asc' | 'desc';

interface Props {
  rankings: DriverStats[];
}

// Columns where lower is better (should sort ascending by default)
const LOWER_IS_BETTER: SortKey[] = ['avg_finish', 'tier'];

// Tier badge colors based on tier number
function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return 'bg-amber-500 text-black';
    case 2: return 'bg-emerald-500 text-black';
    case 3: return 'bg-cyan-500 text-black';
    case 4: return 'bg-purple-500 text-white';
    case 5: return 'bg-pink-500 text-white';
    case 6: return 'bg-indigo-500 text-white';
    default: return 'bg-gray-600 text-white';
  }
}

function TierBadge({ tier }: { tier: number }) {
  // Tier 0 means part-time/ineligible driver
  if (tier === 0) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-gray-700 text-gray-400">
        -
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${getTierColor(tier)}`}>
      {tier}
    </span>
  );
}

export default function DriverRankingsTable({ rankings }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('fantasy_points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter rankings by search term
  const filteredRankings = useMemo(() => {
    if (!searchTerm.trim()) return rankings;
    const term = searchTerm.toLowerCase().trim();
    return rankings.filter(driver =>
      driver.driver_name.toLowerCase().includes(term) ||
      driver.current_car_number.toString().includes(term) ||
      (driver.team_name && driver.team_name.toLowerCase().includes(term))
    );
  }, [rankings, searchTerm]);

  const sortedRankings = useMemo(() => {
    return [...filteredRankings].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      // Handle string comparison for driver_name
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Handle array comparison for car_numbers
      if (Array.isArray(aVal) && Array.isArray(bVal)) {
        const aNum = aVal[0] || 0;
        const bNum = bVal[0] || 0;
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Numeric comparison
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;

      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });
  }, [filteredRankings, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - use default direction (desc for most, asc for avg_finish)
      setSortKey(key);
      setSortDirection(LOWER_IS_BETTER.includes(key) ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return (
        <span className="ml-1 text-purple-600 opacity-50">⇅</span>
      );
    }
    return (
      <span className="ml-1 text-amber-400">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const SortableHeader = ({
    columnKey,
    children,
    className = ''
  }: {
    columnKey: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      className={`px-4 py-3 cursor-pointer hover:bg-purple-800/30 transition-colors select-none ${className}`}
      onClick={() => handleSort(columnKey)}
    >
      <div className="flex items-center justify-center">
        {children}
        <SortIcon columnKey={columnKey} />
      </div>
    </th>
  );

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Search Input */}
      <div className="p-4 border-b border-purple-700/30">
        <div className="relative max-w-md">
          <input
            type="text"
            placeholder="Search by name, car #, or team..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white placeholder-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-500 hover:text-purple-300"
            >
              ✕
            </button>
          )}
        </div>
        {searchTerm && (
          <p className="mt-2 text-sm text-purple-400">
            Showing {sortedRankings.length} of {rankings.length} drivers
          </p>
        )}
      </div>

      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1a1225] text-left text-purple-300 text-sm">
              <th className="px-4 py-3">#</th>
              <SortableHeader columnKey="tier">
                <span className="text-fuchsia-400">Tier</span>
              </SortableHeader>
              <SortableHeader columnKey="driver_name" className="text-left">
                Driver
              </SortableHeader>
              <SortableHeader columnKey="fantasy_points">
                <span className="text-amber-400">FPts</span>
              </SortableHeader>
              <SortableHeader columnKey="weighted_fantasy_points">
                <span className="text-amber-400">WFPts</span>
              </SortableHeader>
              <SortableHeader columnKey="fantasy_points_per_race">
                <span className="text-amber-400">FP/R</span>
              </SortableHeader>
              <SortableHeader columnKey="weighted_fantasy_points_per_race">
                <span className="text-amber-400">WFP/R</span>
              </SortableHeader>
              <SortableHeader columnKey="races">
                Races
              </SortableHeader>
              <SortableHeader columnKey="wins">
                <span className="text-amber-400">Wins</span>
              </SortableHeader>
              <SortableHeader columnKey="stage_wins">
                <span className="text-emerald-400">Stage Wins</span>
              </SortableHeader>
              <SortableHeader columnKey="laps_led_races">
                <span className="text-cyan-400">Laps Led</span>
              </SortableHeader>
              <SortableHeader columnKey="avg_finish">
                Avg Finish
              </SortableHeader>
              <SortableHeader columnKey="top_5s">
                Top 5
              </SortableHeader>
              <SortableHeader columnKey="top_10s">
                Top 10
              </SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sortedRankings.map((driver, index) => {
              const rank = index + 1;

              // Highlight styling based on rank
              let rankClass = 'text-purple-400';
              let rowClass = '';

              if (rank === 1) {
                rankClass = 'text-amber-400 font-bold';
                rowClass = 'bg-amber-500/10';
              } else if (rank <= 3) {
                rankClass = 'text-amber-400';
              } else if (rank <= 10) {
                rankClass = 'text-emerald-400';
              }

              // Show multiple car numbers if driver used more than one
              const carDisplay = driver.car_numbers.length > 1
                ? driver.car_numbers.map(n => `#${n}`).join(', ')
                : `#${driver.current_car_number}`;

              return (
                <tr
                  key={driver.driver_name}
                  className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${rowClass}`}
                >
                  <td className="px-4 py-3">
                    <span className={`text-lg ${rankClass}`}>{rank}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TierBadge tier={driver.tier} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-mono text-sm">{carDisplay}</span>
                        <Link
                          href={`/drivers/${encodeURIComponent(driver.driver_name)}`}
                          className="text-white font-medium hover:text-amber-400 transition-colors"
                        >
                          {driver.driver_name}
                        </Link>
                      </div>
                      {driver.team_name && (
                        <span className="text-purple-500 text-xs">{driver.team_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-amber-400 font-bold">{driver.fantasy_points}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-amber-400 font-semibold">{driver.weighted_fantasy_points.toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-amber-300">{driver.fantasy_points_per_race.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-amber-300">{driver.weighted_fantasy_points_per_race.toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-purple-200">
                    {driver.races}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {driver.wins > 0 ? (
                      <span className="text-amber-400 font-bold text-lg">{driver.wins}</span>
                    ) : (
                      <span className="text-purple-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {driver.stage_wins > 0 ? (
                      <span className="text-emerald-400 font-semibold">{driver.stage_wins}</span>
                    ) : (
                      <span className="text-purple-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {driver.laps_led_races > 0 ? (
                      <span className="text-cyan-400 font-semibold">{driver.laps_led_races}</span>
                    ) : (
                      <span className="text-purple-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${
                      driver.avg_finish <= 10 ? 'text-emerald-400' :
                      driver.avg_finish <= 15 ? 'text-amber-400' :
                      driver.avg_finish <= 20 ? 'text-purple-300' :
                      'text-purple-500'
                    }`}>
                      {driver.avg_finish.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-purple-200">
                    {driver.top_5s}
                  </td>
                  <td className="px-4 py-3 text-center text-purple-200">
                    {driver.top_10s}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
