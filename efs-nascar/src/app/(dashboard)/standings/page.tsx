import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Standing, Team } from '@/types';

export default async function StandingsPage() {
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

  // Get all standings for active season
  const { data: standings } = await supabase
    .from('standings')
    .select('*, team:teams(*)')
    .eq('season_id', activeSeason?.id)
    .is('race_id', null) // Season totals
    .order('rank', { ascending: true });

  // Get completed races count
  const { count: completedRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', activeSeason?.id)
    .eq('status', 'final');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Standings</h1>
          <p className="text-purple-400 mt-1">
            {activeSeason?.name || 'No active season'} • {completedRaces || 0} races completed
          </p>
        </div>
      </div>

      {/* Standings Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full"></div>
          <span className="text-purple-300">Catbird Seats (1-2) - First Round Bye</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
          <span className="text-purple-300">Playoff Position (3-6)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
          <span className="text-purple-300">Lucky Dog (7th)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <span className="text-purple-300">Consolation (8-15)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-purple-300">Muddy Mile (16-17)</span>
        </div>
      </div>

      {/* Standings Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3 text-right">Race Wins</th>
                <th className="px-4 py-3 text-right">Stage Wins</th>
                <th className="px-4 py-3 text-right">Top 10 Bonus</th>
              </tr>
            </thead>
            <tbody>
              {standings?.map((standing: Standing & { team: Team }, index: number) => {
                const rank = standing.rank || index + 1;
                const isUserTeam = standing.team_id === userTeamId;

                // Determine playoff status color and labels
                let statusColor = 'border-purple-600';
                let rankColor = 'text-purple-400';
                let statusLabel = '';

                if (rank <= 2) {
                  // Catbird Seats - First Round Bye
                  statusColor = 'border-amber-400 border-l-[6px]';
                  rankColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300';
                  statusLabel = '🐱 Catbird Seat';
                } else if (rank <= 6) {
                  // Playoff Position
                  statusColor = 'border-emerald-500';
                  rankColor = 'text-emerald-400';
                } else if (rank === 7) {
                  // Lucky Dog
                  statusColor = 'border-amber-400';
                  rankColor = 'text-amber-400';
                  statusLabel = '🐶 Lucky Dog';
                } else if (rank >= 16) {
                  // Muddy Mile
                  statusColor = 'border-red-500';
                  rankColor = 'text-red-400';
                  statusLabel = '💩 Muddy Mile';
                }

                return (
                  <tr
                    key={standing.id}
                    className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${
                      isUserTeam ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <td className={`px-4 py-4 border-l-4 ${statusColor}`}>
                      <span className={`font-bold text-lg ${rankColor}`}>{rank}</span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/teams/${standing.team_id}`}
                        className="flex items-center space-x-3 hover:text-amber-400 transition-colors"
                      >
                        <span className="text-amber-400 font-bold">
                          #{standing.team?.car_number}
                        </span>
                        <span className="text-white font-medium">{standing.team?.name}</span>
                        {isUserTeam && (
                          <span className="text-xs bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 px-2 py-0.5 rounded font-bold">
                            YOU
                          </span>
                        )}
                        {statusLabel && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            rank <= 2 ? 'bg-amber-500/20 text-amber-400' :
                            rank === 7 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {statusLabel}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-white font-bold text-lg">{standing.total_points}</span>
                    </td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.race_wins}</td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.stage_wins}</td>
                    <td className="px-4 py-4 text-right text-purple-200">{standing.top_10_bonuses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(!standings || standings.length === 0) && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-purple-300">No standings data available yet.</p>
          <p className="text-purple-500 text-sm mt-2">
            Standings will appear after the first race results are entered.
          </p>
        </div>
      )}

      {/* Tiebreaker Info */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Tiebreakers</h2>
        <ol className="list-decimal list-inside text-purple-300 space-y-1 text-sm">
          <li>Most race winners picked</li>
          <li>Most stage winners picked</li>
          <li>Most &quot;all 3 in top 10&quot; bonuses</li>
          <li>All-Star race finish position</li>
        </ol>
      </div>
    </div>
  );
}
