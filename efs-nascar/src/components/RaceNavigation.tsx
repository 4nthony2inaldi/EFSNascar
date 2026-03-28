import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Race } from '@/types';

interface RaceNavigationProps {
  currentRace: Race;
  /** Base path for links (e.g., '/races' or '/races/[id]/picks') */
  basePath?: 'results' | 'picks';
}

export async function RaceNavigation({ currentRace, basePath = 'results' }: RaceNavigationProps) {
  const supabase = await createClient();

  // Fetch all races for the season ordered by race_number
  const { data: seasonRaces } = await supabase
    .from('races')
    .select('id, name, track')
    .eq('season_id', currentRace.season_id)
    .order('race_number', { ascending: true });

  if (!seasonRaces || seasonRaces.length === 0) {
    return null;
  }

  // Find current race position in the season
  const currentIndex = seasonRaces.findIndex(r => r.id === currentRace.id);

  if (currentIndex === -1) {
    return null;
  }

  // Get prev/next races based on position
  const prevRace = currentIndex > 0 ? seasonRaces[currentIndex - 1] : null;
  const nextRace = currentIndex < seasonRaces.length - 1 ? seasonRaces[currentIndex + 1] : null;

  // Fantasy race numbers (1-based index)
  const prevFantasyNumber = currentIndex; // prev is currentIndex (which is 0-indexed, so this is the 1-based number for prev)
  const nextFantasyNumber = currentIndex + 2; // next is currentIndex + 1 + 1 (convert to 1-based)

  // Don't render anything if there's no navigation available
  if (!prevRace && !nextRace) {
    return null;
  }

  const getLinkPath = (raceId: string) => {
    if (basePath === 'picks') {
      return `/races/${raceId}/picks`;
    }
    return `/races/${raceId}`;
  };

  return (
    <div className="flex items-center justify-between bg-gray-800 rounded-lg p-4">
      <div className="flex-1">
        {prevRace ? (
          <Link
            href={getLinkPath(prevRace.id)}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors group"
          >
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <div className="text-left">
              <div className="text-xs text-gray-500">Previous Race</div>
              <div className="text-sm font-medium">
                <span className="text-gray-500">#{prevFantasyNumber}</span>{' '}
                {prevRace.name}
              </div>
            </div>
          </Link>
        ) : (
          <div />
        )}
      </div>

      <div className="flex-1 text-right">
        {nextRace ? (
          <Link
            href={getLinkPath(nextRace.id)}
            className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors group"
          >
            <div className="text-right">
              <div className="text-xs text-gray-500">Next Race</div>
              <div className="text-sm font-medium">
                <span className="text-gray-500">#{nextFantasyNumber}</span>{' '}
                {nextRace.name}
              </div>
            </div>
            <svg
              className="w-5 h-5 group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
