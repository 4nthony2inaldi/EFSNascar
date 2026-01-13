import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import type { Race, Pick, Track, TrackType, Season } from '@/types';
import { LocalTime } from '@/components/LocalTime';
import { SeasonSelector } from '@/components/SeasonSelector';
// Schedule page with season selector and picks links

interface RaceWithTrack extends Race {
  track_info: Track | null;
}

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
  const { season: seasonParam } = await searchParams;
  const supabase = await createClient();

  // Get current user's team
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user?.id)
    .single();
  const userTeamId = membership?.team_id;

  // Get all seasons ordered by year descending
  const { data: allSeasons } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false });

  // Get active season as default
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Determine which season to display
  let selectedSeason: Season | null = null;
  if (seasonParam) {
    selectedSeason = allSeasons?.find(s => s.id === seasonParam) || activeSeason;
  } else {
    selectedSeason = activeSeason;
  }

  // Get all races for selected season with track info
  const { data: races } = await supabase
    .from('races')
    .select(`
      *,
      track_info:tracks(*)
    `)
    .eq('season_id', selectedSeason?.id)
    .order('race_number', { ascending: true });

  // Get user's picks for all races
  let userPicks: Record<string, Pick> = {};
  if (userTeamId && races) {
    const { data: picks } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', userTeamId)
      .in('race_id', races.map((r) => r.id));

    if (picks) {
      userPicks = picks.reduce((acc, pick) => {
        acc[pick.race_id] = pick;
        return acc;
      }, {} as Record<string, Pick>);
    }
  }

  const getRaceTypeLabel = (type: string) => {
    switch (type) {
      case 'playoff_round1':
        return { label: 'Round 1', color: 'bg-blue-500' };
      case 'playoff_round2':
        return { label: 'Round 2', color: 'bg-purple-500' };
      case 'playoff_finals':
        return { label: 'Finals', color: 'bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900' };
      case 'exhibition':
        return { label: 'Exhibition', color: 'bg-purple-600' };
      default:
        return null;
    }
  };

  const getTrackTypeInfo = (trackType: TrackType | undefined) => {
    switch (trackType) {
      case 'superspeedway':
        return { label: 'Superspeedway', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🏁' };
      case 'intermediate':
        return { label: 'Intermediate', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🔵' };
      case 'short_track':
        return { label: 'Short Track', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '🟡' };
      case 'road_course':
        return { label: 'Road Course', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '🟢' };
      case 'street_course':
        return { label: 'Street Course', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '🏙️' };
      case 'dirt':
        return { label: 'Dirt', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '🟤' };
      default:
        return null;
    }
  };

  const getStatusBadge = (race: Race) => {
    switch (race.status) {
      case 'final':
        return { label: 'Final', color: 'bg-emerald-500' };
      case 'in_progress':
        return { label: 'Live', color: 'bg-red-500 animate-pulse' };
      default:
        return null;
    }
  };

  // Group races by month
  const racesByMonth = (races as RaceWithTrack[] | null)?.reduce((acc, race) => {
    const month = new Date(race.scheduled_datetime).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    if (!acc[month]) acc[month] = [];
    acc[month].push(race);
    return acc;
  }, {} as Record<string, RaceWithTrack[]>) || {};

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Schedule</h1>
          <p className="text-purple-400 mt-1">
            {selectedSeason?.name || 'No season selected'} • {races?.length || 0} races
          </p>
        </div>

        {/* Season Selector */}
        {allSeasons && allSeasons.length > 1 && selectedSeason && (
          <SeasonSelector
            seasons={allSeasons as Season[]}
            currentSeasonId={selectedSeason.id}
            basePath="/schedule"
          />
        )}
      </div>

      {/* Legend */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap gap-6">
          {/* Race Type Legend */}
          <div>
            <div className="text-xs text-purple-500 mb-2 font-medium">Race Type</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-700 rounded"></div>
                <span className="text-purple-300">Regular</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-purple-300">Playoff R1</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-500 rounded"></div>
                <span className="text-purple-300">Playoff R2</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-amber-400 rounded"></div>
                <span className="text-purple-300">Finals</span>
              </div>
            </div>
          </div>
          {/* Track Type Legend */}
          <div>
            <div className="text-xs text-purple-500 mb-2 font-medium">Track Type</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex items-center space-x-1">
                <span>🏁</span>
                <span className="text-purple-300">Superspeedway</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>🔵</span>
                <span className="text-purple-300">Intermediate</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>🟡</span>
                <span className="text-purple-300">Short Track</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>🟢</span>
                <span className="text-purple-300">Road Course</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>🏙️</span>
                <span className="text-purple-300">Street</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule by Month */}
      {(Object.entries(racesByMonth) as [string, RaceWithTrack[]][]).map(([month, monthRaces]) => (
        <div key={month} className="space-y-4">
          <h2 className="text-xl font-bold text-white">{month}</h2>
          <div className="space-y-3">
            {monthRaces.map((race) => {
              const raceType = getRaceTypeLabel(race.race_type);
              const trackType = getTrackTypeInfo(race.track_info?.track_type);
              const status = getStatusBadge(race);
              const hasPicked = !!userPicks[race.id];
              const isPastDeadline = new Date(race.deadline_datetime) < new Date();

              return (
                <div
                  key={race.id}
                  className={`glass rounded-xl p-4 border-l-4 ${
                    race.status === 'final'
                      ? 'border-emerald-500'
                      : race.status === 'in_progress'
                      ? 'border-red-500'
                      : 'border-purple-600'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center space-x-4">
                      {/* Track Logo */}
                      <div className="relative w-16 h-16 flex-shrink-0 bg-purple-900/30 rounded-lg overflow-hidden flex items-center justify-center border border-purple-700/30">
                        {race.track_info?.logo_url ? (
                          <Image
                            src={race.track_info.logo_url}
                            alt={race.track_info.name}
                            width={56}
                            height={56}
                            className="object-contain"
                          />
                        ) : (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                              {race.race_number}
                            </div>
                            <div className="text-xs text-purple-500">Race</div>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <h3 className="text-lg font-bold text-white">{race.name}</h3>
                          {raceType && (
                            <span className={`px-2 py-0.5 ${raceType.color} text-white text-xs rounded font-medium`}>
                              {raceType.label}
                            </span>
                          )}
                          {status && (
                            <span className={`px-2 py-0.5 ${status.color} text-white text-xs rounded font-medium`}>
                              {status.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-purple-300">{race.track}</p>
                          {trackType && (
                            <span className={`px-2 py-0.5 text-xs rounded border ${trackType.color}`}>
                              {trackType.icon} {trackType.label}
                              {race.track_info?.length_miles && (
                                <span className="ml-1 opacity-75">({race.track_info.length_miles} mi)</span>
                              )}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-purple-500">
                          <LocalTime dateStr={race.scheduled_datetime} format="date" /> at <LocalTime dateStr={race.scheduled_datetime} format="time" />
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {race.status === 'upcoming' && !isPastDeadline && (
                        <div className="text-right">
                          <div className="text-xs text-purple-500">Deadline</div>
                          <div className="text-sm text-purple-200">
                            <LocalTime dateStr={race.deadline_datetime} format="datetime" />
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center space-x-2">
                        {/* View Picks Link - shown when deadline has passed */}
                        {isPastDeadline && (
                          <Link
                            href={`/races/${race.id}/picks`}
                            className="px-3 py-2 bg-purple-600/30 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-600/50 transition-colors border border-purple-500/30"
                            title="View all teams' picks"
                          >
                            📊 Picks
                          </Link>
                        )}

                        {userTeamId && (
                          <>
                            {race.status === 'upcoming' && !isPastDeadline ? (
                              <Link
                                href={`/picks?race=${race.id}`}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                  hasPicked
                                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                                    : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-purple-900 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25'
                                }`}
                              >
                                {hasPicked ? '✓ Picked' : 'Submit Picks'}
                              </Link>
                            ) : race.status === 'final' ? (
                              <Link
                                href={`/races/${race.id}`}
                                className="px-4 py-2 bg-purple-700/30 text-purple-200 rounded-lg text-sm font-medium hover:bg-purple-700/50 transition-colors border border-purple-600/30"
                              >
                                View Results
                              </Link>
                            ) : isPastDeadline ? (
                              <span className={`px-3 py-2 rounded-lg text-sm ${
                                hasPicked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                              }`}>
                                {hasPicked ? '✓ Picked' : 'Missed'}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(!races || races.length === 0) && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-purple-300">No races scheduled for this season.</p>
          <p className="text-purple-500 text-sm mt-2">
            {selectedSeason?.is_active
              ? 'The commissioner will add races when the schedule is available.'
              : 'This is a historical season.'}
          </p>
        </div>
      )}
    </div>
  );
}
