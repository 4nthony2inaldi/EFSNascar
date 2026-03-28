'use client';

import { useState } from 'react';
import type { Driver } from '@/types';

interface DriverUsageData {
  driver: Driver;
  driverId: string;
  timesUsed: number;
  totalPoints: number;
  avgPoints: number;
  maxPotential: number;
}

interface DriverUsageTableProps {
  data: DriverUsageData[];
}

type SortKey = 'name' | 'timesUsed' | 'totalPoints' | 'avgPoints' | 'maxPotential' | 'efficiency';
type SortDirection = 'asc' | 'desc';

export function DriverUsageTable({ data }: DriverUsageTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortKey) {
      case 'name':
        aVal = a.driver?.name || '';
        bVal = b.driver?.name || '';
        break;
      case 'timesUsed':
        aVal = a.timesUsed;
        bVal = b.timesUsed;
        break;
      case 'totalPoints':
        aVal = a.totalPoints;
        bVal = b.totalPoints;
        break;
      case 'avgPoints':
        aVal = a.avgPoints;
        bVal = b.avgPoints;
        break;
      case 'maxPotential':
        aVal = a.maxPotential;
        bVal = b.maxPotential;
        break;
      case 'efficiency':
        aVal = a.maxPotential > 0 ? a.totalPoints / a.maxPotential : 0;
        bVal = b.maxPotential > 0 ? b.totalPoints / b.maxPotential : 0;
        break;
      default:
        aVal = a.totalPoints;
        bVal = b.totalPoints;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDirection === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const SortHeader = ({ label, sortKeyName, className = '' }: { label: string; sortKeyName: SortKey; className?: string }) => (
    <th
      className={`pb-2 px-1 cursor-pointer hover:text-white transition-colors select-none text-center ${className}`}
      onClick={() => handleSort(sortKeyName)}
    >
      <div className="flex items-center justify-center gap-0.5">
        <span className="text-xs">{label}</span>
        {sortKey === sortKeyName && (
          <span className="text-amber-400 text-xs">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  // Format driver name: last name only for mobile (handle Jr/Sr suffixes)
  const formatDriverName = (name: string | undefined): { full: string; short: string } => {
    if (!name) return { full: '', short: '' };
    const parts = name.split(' ');
    if (parts.length < 2) return { full: name, short: name };

    // Check if last part is a suffix like Jr, Jr., Sr, Sr., II, III, IV
    const lastPart = parts[parts.length - 1];
    const suffixes = ['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV'];

    let lastName: string;
    if (suffixes.includes(lastPart) && parts.length > 2) {
      // Use second-to-last part + suffix
      lastName = `${parts[parts.length - 2]} ${lastPart}`;
    } else {
      lastName = lastPart;
    }

    return {
      full: name,
      short: lastName,
    };
  };

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 text-xs border-b border-gray-700">
            <th
              className="pb-2 pr-1 cursor-pointer hover:text-white transition-colors select-none sticky left-0 bg-gray-800 z-10 min-w-[60px] sm:min-w-[100px]"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center gap-0.5">
                <span className="text-xs">Driver</span>
                {sortKey === 'name' && (
                  <span className="text-amber-400 text-xs">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            </th>
            <SortHeader label="Use" sortKeyName="timesUsed" />
            <SortHeader label="Pts" sortKeyName="totalPoints" />
            <SortHeader label="Avg" sortKeyName="avgPoints" />
            <SortHeader label="Max" sortKeyName="maxPotential" />
            <SortHeader label="Eff" sortKeyName="efficiency" />
          </tr>
        </thead>
        <tbody>
          {sortedData.map((usage) => {
            const efficiency = usage.maxPotential > 0
              ? Math.round((usage.totalPoints / usage.maxPotential) * 100)
              : 0;
            const pointsLeft = usage.maxPotential - usage.totalPoints;
            const driverName = formatDriverName(usage.driver?.name);

            return (
              <tr key={usage.driverId} className="border-b border-gray-700/50">
                <td className="py-2 pr-1 sticky left-0 bg-gray-800 z-10">
                  <div className="truncate max-w-[70px] sm:max-w-none">
                    <span className="text-white hidden sm:inline text-sm">{driverName.full}</span>
                    <span className="text-white sm:hidden text-xs">{driverName.short}</span>
                  </div>
                </td>
                <td className="py-2 px-1 text-center">
                  <span className={`font-bold text-xs ${
                    usage.timesUsed >= 4 ? 'text-red-400' :
                    usage.timesUsed >= 3 ? 'text-yellow-400' : 'text-white'
                  }`}>
                    {usage.timesUsed}
                  </span>
                </td>
                <td className="py-2 px-1 text-center">
                  <span className="font-bold text-amber-400 text-xs">{usage.totalPoints}</span>
                </td>
                <td className="py-2 px-1 text-center">
                  <span className={`font-medium text-xs ${
                    usage.avgPoints >= 8 ? 'text-emerald-400' :
                    usage.avgPoints >= 5 ? 'text-amber-400' :
                    usage.avgPoints >= 3 ? 'text-gray-300' : 'text-red-400'
                  }`}>
                    {usage.avgPoints.toFixed(1)}
                  </span>
                </td>
                <td className="py-2 px-1 text-center">
                  <span className="text-cyan-400 font-medium text-xs">{usage.maxPotential}</span>
                  {pointsLeft > 0 && (
                    <span className="text-gray-500 text-xs ml-0.5">-{pointsLeft}</span>
                  )}
                </td>
                <td className="py-2 px-1 text-center">
                  <span className={`font-bold text-xs ${
                    efficiency >= 90 ? 'text-emerald-400' :
                    efficiency >= 70 ? 'text-amber-400' :
                    efficiency >= 50 ? 'text-gray-300' : 'text-red-400'
                  }`}>
                    {efficiency}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-500">
        <p><strong>Max:</strong> Best {sortedData[0]?.timesUsed || 'X'} races • <strong>Eff:</strong> Actual ÷ Max</p>
        <p className="text-gray-600 mt-1">Tap headers to sort</p>
      </div>
    </div>
  );
}
