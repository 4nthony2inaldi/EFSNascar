import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Race, Pick, Team } from '@/types';

export default async function SchedulePage() {
  const supabase = await createClient();

  // Get current user's team
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user?.id)
    .single();
  const userTeamId = membership?.team_id;

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Get all races for active season
  const { data: races } = await supabase
    .from('races')
    .select('*')
    .eq('season_id', activeSeason?.id)
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getRaceTypeLabel = (type: string) => {
    switch (type) {
      case 'playoff_round1':
        return { label: 'Round 1', color: 'bg-blue-500' };
      case 'playoff_round2':
        return { label: 'Round 2', color: 'bg-purple-500' };
      case 'playoff_finals':
        return { label: 'Finals', color: 'bg-yellow-500' };
      case 'exhibition':
        return { label: 'Exhibition', color: 'bg-gray-500' };
      default:
        return null;
    }
  };

  const getStatusBadge = (race: Race) => {
    switch (race.status) {
      case 'final':
        return { label: 'Final', color: 'bg-green-500' };
      case 'in_progress':
        return { label: 'Live', color: 'bg-red-500 animate-pulse' };
      default:
        return null;
    }
  };

  // Group races by month
  const racesByMonth = races?.reduce((acc, race) => {
    const month = new Date(race.scheduled_datetime).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    if (!acc[month]) acc[month] = [];
    acc[month].push(race);
    return acc;
  }, {} as Record<string, Race[]>) || {};

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Schedule</h1>
        <p className="text-gray-400 mt-1">
          {activeSeason?.name || 'No active season'} • {races?.length || 0} races
        </p>
      </div>

      {/* Race Type Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-700 rounded"></div>
          <span className="text-gray-400">Regular Season</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span className="text-gray-400">Playoff Round 1</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded"></div>
          <span className="text-gray-400">Playoff Round 2</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
          <span className="text-gray-400">Playoff Finals</span>
        </div>
      </div>

      {/* Schedule by Month */}
      {Object.entries(racesByMonth).map(([month, monthRaces]) => (
        <div key={month} className="space-y-4">
          <h2 className="text-xl font-bold text-white">{month}</h2>
          <div className="space-y-3">
            {monthRaces.map((race) => {
              const raceType = getRaceTypeLabel(race.race_type);
              const status = getStatusBadge(race);
              const hasPicked = !!userPicks[race.id];
              const isPastDeadline = new Date(race.deadline_datetime) < new Date();

              return (
                <div
                  key={race.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    race.status === 'final'
                      ? 'border-green-500'
                      : race.status === 'in_progress'
                      ? 'border-red-500'
                      : 'border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="text-center min-w-[60px]">
                        <div className="text-2xl font-bold text-yellow-500">
                          {race.race_number}
                        </div>
                        <div className="text-xs text-gray-500">Race</div>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-bold text-white">{race.name}</h3>
                          {raceType && (
                            <span className={`px-2 py-0.5 ${raceType.color} text-white text-xs rounded`}>
                              {raceType.label}
                            </span>
                          )}
                          {status && (
                            <span className={`px-2 py-0.5 ${status.color} text-white text-xs rounded`}>
                              {status.label}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-400">{race.track}</p>
                        <p className="text-sm text-gray-500">
                          {formatDate(race.scheduled_datetime)} at {formatTime(race.scheduled_datetime)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {race.status === 'upcoming' && (
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Deadline</div>
                          <div className="text-sm text-gray-300">
                            {formatDate(race.deadline_datetime)} {formatTime(race.deadline_datetime)}
                          </div>
                        </div>
                      )}
                      {userTeamId && (
                        <>
                          {race.status === 'upcoming' && !isPastDeadline ? (
                            <Link
                              href={`/picks?race=${race.id}`}
                              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                hasPicked
                                  ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                                  : 'bg-yellow-500 text-black hover:bg-yellow-400'
                              }`}
                            >
                              {hasPicked ? '✓ Picked' : 'Submit Picks'}
                            </Link>
                          ) : race.status === 'final' ? (
                            <Link
                              href={`/races/${race.id}`}
                              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md text-sm font-medium hover:bg-gray-600 transition-colors"
                            >
                              View Results
                            </Link>
                          ) : isPastDeadline ? (
                            <span className="px-4 py-2 bg-gray-700 text-gray-500 rounded-md text-sm">
                              {hasPicked ? '✓ Picked' : 'Missed'}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {(!races || races.length === 0) && (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400">No races scheduled yet.</p>
          <p className="text-gray-500 text-sm mt-2">
            The commissioner will add races when the schedule is available.
          </p>
        </div>
      )}
    </div>
  );
}
