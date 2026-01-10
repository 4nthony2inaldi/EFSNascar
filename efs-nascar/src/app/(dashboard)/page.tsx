import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Race, Team, Standing, Pick } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Get user's team
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user?.id)
    .single();

  const userTeam = membership?.team as Team | null;

  // Get next upcoming race for the active season
  const { data: nextRace } = await supabase
    .from('races')
    .select('*')
    .eq('season_id', activeSeason?.id)
    .eq('status', 'upcoming')
    .order('scheduled_datetime', { ascending: true })
    .limit(1)
    .single();

  // Check if user has submitted picks for next race
  let hasPicked = false;
  let userPick: Pick | null = null;
  if (nextRace && userTeam) {
    const { data: pick } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', userTeam.id)
      .eq('race_id', nextRace.id)
      .single();
    hasPicked = !!pick;
    userPick = pick as Pick | null;
  }

  // Get top 10 standings
  const { data: standings } = await supabase
    .from('standings')
    .select('*, team:teams(*)')
    .eq('season_id', activeSeason?.id)
    .is('race_id', null) // Season totals
    .order('rank', { ascending: true })
    .limit(10);

  // Get recent announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*, author:profiles(name)')
    .order('posted_at', { ascending: false })
    .limit(3);

  // Calculate countdown to deadline
  const getTimeUntilDeadline = (deadline: string) => {
    const now = Date.now();
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - now;

    if (diff <= 0) return 'Deadline passed';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Check if deadline is actually passed (for conditional rendering)
  const isDeadlinePassed = nextRace ? new Date(nextRace.deadline_datetime).getTime() < Date.now() : false;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-purple-400 mt-1">
          {activeSeason ? `${activeSeason.name} Season` : 'No active season'}
        </p>
      </div>

      {/* Alert if no team */}
      {!userTeam && (
        <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-lg">
          <p className="font-medium">You&apos;re not assigned to a team yet.</p>
          <p className="text-sm mt-1 text-amber-400/80">Contact a commissioner to be added to a team.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Next Race Card */}
        <div className="lg:col-span-2 glass rounded-xl p-6 card-hover">
          <h2 className="text-xl font-bold text-white mb-4">Next Race</h2>
          {nextRace ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">{nextRace.name}</h3>
                  <p className="text-purple-300">{nextRace.track}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-purple-400">Deadline</div>
                  <div className="text-2xl font-bold text-white">
                    {getTimeUntilDeadline(nextRace.deadline_datetime)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-purple-400 mb-6">
                <span>
                  Race #{nextRace.race_number} •{' '}
                  {new Date(nextRace.scheduled_datetime).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {userTeam && (
                <div className="flex items-center justify-between">
                  {isDeadlinePassed ? (
                    <div className={`flex items-center ${hasPicked ? 'text-emerald-400' : 'text-red-400'}`}>
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        {hasPicked ? (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        ) : (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        )}
                      </svg>
                      {hasPicked ? 'Picks submitted' : 'Deadline missed'}
                    </div>
                  ) : hasPicked ? (
                    <div className="flex items-center text-emerald-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Picks submitted
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Picks not submitted
                    </div>
                  )}
                  {!isDeadlinePassed && (
                    <Link
                      href={`/picks?race=${nextRace.id}`}
                      className="px-5 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
                    >
                      {hasPicked ? 'Edit Picks' : 'Submit Picks'}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-purple-400">No upcoming races scheduled.</p>
          )}
        </div>

        {/* Your Team Card */}
        {userTeam && (
          <div className="glass rounded-xl p-6 card-hover">
            <h2 className="text-xl font-bold text-white mb-4">Your Team</h2>
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-600/30 to-purple-800/30 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">#{userTeam.car_number}</span>
              </div>
              <h3 className="text-xl font-bold text-white">{userTeam.name}</h3>
              <Link
                href={`/teams/${userTeam.id}`}
                className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block"
              >
                View Team Profile →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Standings Preview */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Standings</h2>
          <Link
            href="/standings"
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            View Full Standings →
          </Link>
        </div>

        {standings && standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-purple-400 text-sm border-b border-purple-700/30">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 pr-4 text-right">Points</th>
                  <th className="pb-3 text-right">Wins</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing: any, index: number) => (
                  <tr
                    key={standing.id}
                    className={`border-b border-purple-800/20 ${
                      standing.team?.id === userTeam?.id ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <span className={`font-bold ${index < 6 ? 'text-emerald-400' : index === 6 ? 'text-amber-400' : 'text-purple-400'}`}>
                        {standing.rank || index + 1}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center">
                        <span className="text-amber-400 font-bold mr-2">
                          #{standing.team?.car_number}
                        </span>
                        <span className="text-white">{standing.team?.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right text-white font-medium">
                      {standing.total_points}
                    </td>
                    <td className="py-3 text-right text-purple-300">
                      {standing.race_wins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-purple-400">No standings data available yet.</p>
        )}
      </div>

      {/* Recent Announcements */}
      {announcements && announcements.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Announcements</h2>
          <div className="space-y-4">
            {announcements.map((announcement: any) => (
              <div key={announcement.id} className="border-l-4 border-amber-500 pl-4">
                <h3 className="text-white font-medium">{announcement.title}</h3>
                <p className="text-purple-300 text-sm mt-1">{announcement.body}</p>
                <p className="text-purple-500 text-xs mt-2">
                  {announcement.author?.name} •{' '}
                  {new Date(announcement.posted_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
