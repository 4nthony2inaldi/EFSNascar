'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import type { TeamWithOwner, DriverWithStats, SeasonOption } from './page';

interface Props {
  drivers: DriverWithStats[];
  teams: TeamWithOwner[];
  usageMap: Record<string, Record<string, number>>;
  seasons: SeasonOption[];
  selectedSeasonId: string;
}

type SortKey = 'weighted_fantasy_points' | 'driver_name' | 'tier';
type SortDirection = 'asc' | 'desc';

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
  if (tier === 0) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-gray-700 text-gray-400">
        -
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${getTierColor(tier)}`}>
      {tier}
    </span>
  );
}

function UsageCell({ count }: { count: number }) {
  // Color intensity based on usage count
  let bgClass = '';
  let textClass = 'text-purple-600';

  if (count >= 4) {
    bgClass = 'bg-red-500/40';
    textClass = 'text-white font-bold';
  } else if (count >= 2) {
    bgClass = 'bg-red-500/20';
    textClass = 'text-red-300';
  } else if (count === 1) {
    bgClass = 'bg-red-500/10';
    textClass = 'text-red-400/80';
  }

  return (
    <td className={`px-2 py-2 text-center text-sm ${bgClass}`}>
      <span className={textClass}>{count}</span>
    </td>
  );
}

// Get shortened name for mobile: "F. LastName" or "Fi. LastName" if conflicts exist
function getShortName(fullName: string, allNames: string[]): string {
  const parts = fullName.trim().split(' ');
  if (parts.length < 2) return fullName;

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  // Check if single initial + last name would be unique
  const singleInitialName = `${firstName[0]}. ${lastName}`;
  const conflictsWith = allNames.filter(name => {
    if (name === fullName) return false;
    const otherParts = name.trim().split(' ');
    if (otherParts.length < 2) return false;
    const otherLastName = otherParts.slice(1).join(' ');
    return otherLastName === lastName && otherParts[0][0] === firstName[0];
  });

  if (conflictsWith.length === 0) {
    return singleInitialName;
  }

  // Use two initials if there's a conflict
  const twoInitials = firstName.length >= 2 ? firstName.slice(0, 2) : firstName;
  return `${twoInitials}. ${lastName}`;
}

export default function DriverUsageTable({
  drivers,
  teams,
  usageMap,
  seasons,
  selectedSeasonId
}: Props) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('weighted_fantasy_points');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Get all driver names for short name calculation
  const allDriverNames = useMemo(() => drivers.map(d => d.driver_name), [drivers]);

  const sortedDrivers = useMemo(() => {
    return [...drivers].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortKey) {
        case 'driver_name':
          aVal = a.driver_name;
          bVal = b.driver_name;
          if (sortDirection === 'asc') {
            return aVal.localeCompare(bVal);
          }
          return bVal.localeCompare(aVal);
        case 'tier':
          // Tier 0 (part-time) should sort last
          aVal = a.tier || 999;
          bVal = b.tier || 999;
          break;
        default:
          aVal = a[sortKey] as number;
          bVal = b[sortKey] as number;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });
  }, [drivers, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // Default direction for each column
      setSortDirection(key === 'tier' ? 'asc' : 'desc');
    }
  };

  const handleSeasonChange = (seasonId: string) => {
    router.push(`/driver-usage?season=${seasonId}`);
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <span className="ml-1 text-purple-600 opacity-50 text-xs">&#8645;</span>;
    }
    return (
      <span className="ml-1 text-amber-400 text-xs">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Season Selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-purple-200">
          Season:
        </label>
        <select
          value={selectedSeasonId}
          onChange={(e) => handleSeasonChange(e.target.value)}
          className="px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name} {season.is_active ? '(Current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              {/* Header row 1: Owner names */}
              <tr className="bg-purple-900/30 text-purple-300 text-xs">
                <th className="px-2 md:px-3 py-2 text-left sticky left-0 bg-purple-900/90 z-20 min-w-[140px] md:min-w-[200px]" colSpan={2}>
                  <span className="text-white font-bold">Standings</span>
                </th>
                {teams.map(team => (
                  <th key={team.id} className="px-2 py-2 text-center font-medium min-w-[50px] md:min-w-[60px]">
                    <span className="text-white text-[10px] md:text-xs">{team.owner_name}</span>
                  </th>
                ))}
              </tr>
              {/* Header row 2: Team names */}
              <tr className="bg-purple-900/20 text-purple-400 text-xs border-b border-purple-700/30">
                <th
                  className="px-2 md:px-3 py-2 text-left sticky left-0 bg-purple-900/90 z-20 cursor-pointer hover:bg-purple-800/50"
                  onClick={() => handleSort('weighted_fantasy_points')}
                >
                  <div className="flex items-center">
                    <span className="text-amber-400 text-[10px] md:text-xs">WFPts</span>
                    <SortIcon columnKey="weighted_fantasy_points" />
                  </div>
                </th>
                <th
                  className="px-2 md:px-3 py-2 text-left sticky left-[52px] md:left-[70px] bg-purple-900/90 z-20 cursor-pointer hover:bg-purple-800/50"
                  onClick={() => handleSort('driver_name')}
                >
                  <div className="flex items-center">
                    <span className="text-[10px] md:text-xs">Driver</span>
                    <SortIcon columnKey="driver_name" />
                  </div>
                </th>
                {teams.map(team => (
                  <th key={team.id} className="px-2 py-2 text-center text-purple-500 text-[8px] md:text-[10px] min-w-[50px] md:min-w-[60px]">
                    {team.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedDrivers.map((driver) => {
                const shortName = getShortName(driver.driver_name, allDriverNames);

                return (
                  <tr
                    key={driver.driver_id}
                    className="border-b border-purple-800/20 hover:bg-purple-800/10 transition-colors"
                  >
                    {/* WFPts column - sticky */}
                    <td className="px-2 md:px-3 py-2 sticky left-0 bg-[#0f0a1a] z-10">
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-amber-400 font-bold text-xs md:text-sm">
                          {Math.round(driver.weighted_fantasy_points)}
                        </span>
                        <TierBadge tier={driver.tier} />
                      </div>
                    </td>
                    {/* Driver name column - also sticky */}
                    <td className="px-2 md:px-3 py-2 sticky left-[52px] md:left-[70px] bg-[#0f0a1a] z-10">
                      <div className="flex items-center gap-2">
                        {/* Car number - hidden on mobile */}
                        <span className="hidden md:inline text-amber-400 font-mono text-xs">#{driver.car_number}</span>
                        <Link
                          href={`/drivers/${encodeURIComponent(driver.driver_name)}`}
                          className="text-white text-xs md:text-sm hover:text-amber-400 transition-colors whitespace-nowrap"
                        >
                          {/* Short name on mobile, full name on desktop */}
                          <span className="md:hidden">{shortName}</span>
                          <span className="hidden md:inline">{driver.driver_name}</span>
                        </Link>
                      </div>
                    </td>
                    {/* Usage cells for each team */}
                    {teams.map(team => {
                      const usage = usageMap[driver.driver_id]?.[team.id] || 0;
                      return <UsageCell key={team.id} count={usage} />;
                    })}
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
