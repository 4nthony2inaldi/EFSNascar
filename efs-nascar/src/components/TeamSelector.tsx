'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface TeamOption {
  id: string;
  name: string;
  car_number: number;
}

interface TeamSelectorProps {
  teams: TeamOption[];
  currentTeamId: string;
}

export function TeamSelector({ teams, currentTeamId }: TeamSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTeamChange = (teamId: string) => {
    if (teamId === currentTeamId) return;

    // Preserve search params (like season)
    const params = new URLSearchParams(searchParams.toString());
    const queryString = params.toString();
    const url = `/teams/${teamId}${queryString ? `?${queryString}` : ''}`;

    router.push(url);
  };

  return (
    <select
      value={currentTeamId}
      onChange={(e) => handleTeamChange(e.target.value)}
      className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
    >
      {teams.map((team) => (
        <option key={team.id} value={team.id} className="bg-gray-800">
          #{team.car_number} - {team.name}
        </option>
      ))}
    </select>
  );
}
