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

type SortKey = 'car_number' | 'name' | 'timesUsed' | 'totalPoints' | 'avgPoints' | 'maxPotential' | 'efficiency';
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
      case 'car_number':
        aVal = parseInt(String(a.driver?.car_number || '999'));
        bVal = parseInt(String(b.driver?.car_number || '999'));
        break;
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
      className={`pb-3 cursor-pointer hover:text-white transition-colors select-none ${className}`}
      onClick={() => handleSort(sortKeyName)}
    >
      <div className="flex items-center justify-center gap-1">
        <span>{label}</span>
        {sortKey === sortKeyName && (
          <span className="text-amber-400">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    </th>
  );

  // Format driver name: first initial + last name for mobile
  const formatDriverName = (name: string | undefined): { full: string; short: string } => {
    if (!name) return { full: '', short: '' };
    const parts = name.split(' ');
    if (parts.length < 2) return { full: name, short: name };
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return {
      full: name,
      short: `${firstName[0]}. ${lastName}`,
    };
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
            <th
              className="pb-3 pr-2 cursor-pointer hover:text-white transition-colors select-none sticky left-0 bg-gray-800 z-10"
              onClick={() => handleSort('car_number')}
            >
              <div className="flex items-center gap-1">
                <span>#</span>
                {sortKey === 'car_number' && (
                  <span className="text-amber-400">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            </th>
            <th
              className="pb-3 pr-4 cursor-pointer hover:text-white transition-colors select-none sticky left-10 bg-gray-800 z-10"
              onClick={() => handleSort('name')}
            >
              <div className="flex items-center gap-1">
                <span>Driver</span>
                {sortKey === 'name' && (
                  <span className="text-amber-400">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </div>
            </th>
            <SortHeader label="Uses" sortKeyName="timesUsed" />
            <SortHeader label="Total" sortKeyName="totalPoints" />
            <SortHeader label="Avg" sortKeyName="avgPoints" />
            <SortHeader label="Max" sortKeyName="maxPotential" />
            <SortHeader label="Eff%" sortKeyName="efficiency" />
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
                <td className="py-3 pr-2 text-yellow-500 font-bold sticky left-0 bg-gray-800 z-10">
                  {usage.driver?.car_number}
                </td>
                <td className="py-3 pr-4 sticky left-10 bg-gray-800 z-10">
                  <div>
                    {/* Full name on larger screens, short on mobile */}
                    <span className="text-white hidden sm:inline">{driverName.full}</span>
                    <span className="text-white sm:hidden">{driverName.short}</span>
                    <span className="text-gray-500 text-xs ml-2 hidden md:inline">
                      {usage.driver?.team_name}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-center">
                  <span className={`font-bold ${
                    usage.timesUsed >= 4 ? 'text-red-400' :
                    usage.timesUsed >= 3 ? 'text-yellow-400' : 'text-white'
                  }`}>
                    {usage.timesUsed}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <span className="font-bold text-amber-400">{usage.totalPoints}</span>
                </td>
                <td className="py-3 text-center">
                  <span className={`font-medium ${
                    usage.avgPoints >= 8 ? 'text-emerald-400' :
                    usage.avgPoints >= 5 ? 'text-amber-400' :
                    usage.avgPoints >= 3 ? 'text-gray-300' : 'text-red-400'
                  }`}>
                    {usage.avgPoints.toFixed(1)}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-cyan-400 font-medium">{usage.maxPotential}</span>
                    {pointsLeft > 0 && (
                      <span className="text-xs text-gray-500">
                        (-{pointsLeft})
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 text-center">
                  <span className={`font-bold ${
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
      <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
        <p><strong>Max:</strong> Points from their best {sortedData[0]?.timesUsed || 'X'} races</p>
        <p><strong>Eff%:</strong> Actual vs max (did you pick them in their best races?)</p>
        <p className="mt-1 text-gray-600">Click column headers to sort</p>
      </div>
    </div>
  );
}
