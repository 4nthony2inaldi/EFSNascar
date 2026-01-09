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
          <p className="text-gray-400 mt-1">
            {activeSeason?.name || 'No active season'} • {completedRaces || 0} races completed
          </p>
        </div>
      </div>

      {/* Standings Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-gray-400">Playoff Position (1-6)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <span className="text-gray-400">Lucky Dog (7th)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
          <span className="text-gray-400">Consolation (8-15)</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-gray-400">Bottom 2 (16-17)</span>
        </div>
      </div>

      {/* Standings Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-left text-gray-400 text-sm">
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

                // Determine playoff status color
                let statusColor = 'border-gray-600';
                let rankColor = 'text-gray-400';
                if (rank <= 6) {
                  statusColor = 'border-green-500';
                  rankColor = 'text-green-500';
                } else if (rank === 7) {
                  statusColor = 'border-yellow-500';
                  rankColor = 'text-yellow-500';
                } else if (rank >= 16) {
                  statusColor = 'border-red-500';
                  rankColor = 'text-red-500';
                }

                return (
                  <tr
                    key={standing.id}
                    className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                      isUserTeam ? 'bg-yellow-500/10' : ''
                    }`}
                  >
                    <td className={`px-4 py-4 border-l-4 ${statusColor}`}>
                      <span className={`font-bold text-lg ${rankColor}`}>{rank}</span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/teams/${standing.team_id}`}
                        className="flex items-center space-x-3 hover:text-yellow-500 transition-colors"
                      >
                        <span className="text-yellow-500 font-bold">
                          #{standing.team?.car_number}
                        </span>
                        <span className="text-white font-medium">{standing.team?.name}</span>
                        {isUserTeam && (
                          <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">
                            YOU
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-white font-bold text-lg">{standing.total_points}</span>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-300">{standing.race_wins}</td>
                    <td className="px-4 py-4 text-right text-gray-300">{standing.stage_wins}</td>
                    <td className="px-4 py-4 text-right text-gray-300">{standing.top_10_bonuses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(!standings || standings.length === 0) && (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400">No standings data available yet.</p>
          <p className="text-gray-500 text-sm mt-2">
            Standings will appear after the first race results are entered.
          </p>
        </div>
      )}

      {/* Tiebreaker Info */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-bold text-white mb-3">Tiebreakers</h2>
        <ol className="list-decimal list-inside text-gray-400 space-y-1 text-sm">
          <li>Most race winners picked</li>
          <li>Most stage winners picked</li>
          <li>Most &quot;all 3 in top 10&quot; bonuses</li>
          <li>All-Star race finish position</li>
        </ol>
      </div>
    </div>
  );
}
