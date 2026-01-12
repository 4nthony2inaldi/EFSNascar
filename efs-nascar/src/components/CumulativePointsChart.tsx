'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TeamData {
  teamId: string;
  teamName: string;
  abbreviation: string | null;
  carNumber: number;
  color: string;
}

interface RacePointData {
  raceNumber: number;
  raceName: string;
  [teamId: string]: number | string; // Dynamic team cumulative points
}

interface CumulativePointsChartProps {
  data: RacePointData[];
  teams: TeamData[];
  userTeamId?: string;
}

// Generate distinct colors for teams
const TEAM_COLORS = [
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
  '#eab308', // yellow
  '#22c55e', // green
  '#0ea5e9', // sky
  '#e11d48', // rose
  '#7c3aed', // violet-600
];

export function CumulativePointsChart({ data, teams, userTeamId }: CumulativePointsChartProps) {
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(() => {
    // Default to showing all teams, but highlight user's team
    return new Set(teams.map(t => t.teamId));
  });

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedTeams(new Set(teams.map(t => t.teamId)));
  };

  const selectNone = () => {
    setSelectedTeams(new Set());
  };

  const selectOnlyUser = () => {
    if (userTeamId) {
      setSelectedTeams(new Set([userTeamId]));
    }
  };

  if (data.length === 0) {
    return (
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Points Trend</h2>
        <p className="text-purple-400 text-center py-8">No race data available yet.</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h2 className="text-lg font-bold text-white">Cumulative Points Trend</h2>
        <div className="flex gap-2 text-xs">
          <button
            onClick={selectAll}
            className="px-2 py-1 bg-purple-700/50 hover:bg-purple-600/50 text-purple-200 rounded transition-colors"
          >
            All
          </button>
          <button
            onClick={selectNone}
            className="px-2 py-1 bg-purple-700/50 hover:bg-purple-600/50 text-purple-200 rounded transition-colors"
          >
            None
          </button>
          {userTeamId && (
            <button
              onClick={selectOnlyUser}
              className="px-2 py-1 bg-amber-600/50 hover:bg-amber-500/50 text-amber-200 rounded transition-colors"
            >
              My Team
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#4c1d95" opacity={0.3} />
            <XAxis
              dataKey="raceNumber"
              stroke="#a78bfa"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#4c1d95' }}
            />
            <YAxis
              stroke="#a78bfa"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#4c1d95' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e1b4b',
                border: '1px solid #4c1d95',
                borderRadius: '8px',
                color: '#e9d5ff',
              }}
              labelFormatter={(value) => {
                const race = data.find(d => d.raceNumber === value);
                return race ? `Race ${value}: ${race.raceName}` : `Race ${value}`;
              }}
            />
            {teams.map((team, index) => (
              selectedTeams.has(team.teamId) && (
                <Line
                  key={team.teamId}
                  type="monotone"
                  dataKey={team.teamId}
                  name={team.abbreviation || team.teamName}
                  stroke={team.teamId === userTeamId ? '#fbbf24' : TEAM_COLORS[index % TEAM_COLORS.length]}
                  strokeWidth={team.teamId === userTeamId ? 3 : 1.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              )
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Team Legend/Toggles */}
      <div className="mt-4 flex flex-wrap gap-2">
        {teams.map((team, index) => {
          const isSelected = selectedTeams.has(team.teamId);
          const isUserTeam = team.teamId === userTeamId;
          const color = isUserTeam ? '#fbbf24' : TEAM_COLORS[index % TEAM_COLORS.length];

          return (
            <button
              key={team.teamId}
              onClick={() => toggleTeam(team.teamId)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
                isSelected
                  ? 'bg-purple-700/50 text-white'
                  : 'bg-purple-900/30 text-purple-500'
              } ${isUserTeam ? 'ring-1 ring-amber-400' : ''}`}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: isSelected ? color : '#6b7280' }}
              />
              <span className="hidden sm:inline">#{team.carNumber}</span>
              <span>{team.abbreviation || team.teamName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
