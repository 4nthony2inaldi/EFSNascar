'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Season } from '@/types';

interface SeasonSelectorProps {
  seasons: Season[];
  currentSeasonId: string;
  basePath: string;
}

// Cookie name for persisting season selection
export const SEASON_COOKIE_NAME = 'efs_selected_season';

export function SeasonSelector({ seasons, currentSeasonId, basePath }: SeasonSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSeasonChange = (seasonId: string) => {
    const params = new URLSearchParams(searchParams.toString());

    // Find the active season
    const activeSeason = seasons.find(s => s.is_active);

    // If selecting the active season, remove the param and cookie
    if (activeSeason && seasonId === activeSeason.id) {
      params.delete('season');
      // Clear the cookie by setting it to expire
      document.cookie = `${SEASON_COOKIE_NAME}=; path=/; max-age=0`;
    } else {
      params.set('season', seasonId);
      // Set cookie to persist selection (expires in 30 days)
      document.cookie = `${SEASON_COOKIE_NAME}=${seasonId}; path=/; max-age=${60 * 60 * 24 * 30}`;
    }

    const queryString = params.toString();
    router.push(`${basePath}${queryString ? `?${queryString}` : ''}`);
  };

  const currentSeason = seasons.find(s => s.id === currentSeasonId);
  const activeSeason = seasons.find(s => s.is_active);
  const isViewingActiveSeason = currentSeasonId === activeSeason?.id;

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentSeasonId}
        onChange={(e) => handleSeasonChange(e.target.value)}
        className="bg-purple-900/50 border border-purple-700/50 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 cursor-pointer"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id} className="bg-purple-900">
            {season.name} {season.is_active && '(Current)'}
          </option>
        ))}
      </select>
      {!isViewingActiveSeason && (
        <span className="text-xs text-amber-400 bg-amber-500/20 px-2 py-1 rounded">
          Viewing Past Season
        </span>
      )}
    </div>
  );
}
