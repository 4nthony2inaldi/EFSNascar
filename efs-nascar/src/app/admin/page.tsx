import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  // Get counts
  const { count: teamCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true });

  const { count: driverCount } = await supabase
    .from('drivers')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  const { count: raceCount } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', activeSeason?.id);

  const { count: completedRaces } = await supabase
    .from('races')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', activeSeason?.id)
    .eq('status', 'final');

  // Get next race needing results
  const { data: racesNeedingResults } = await supabase
    .from('races')
    .select('*')
    .eq('status', 'upcoming')
    .lt('scheduled_datetime', new Date().toISOString())
    .order('scheduled_datetime', { ascending: true })
    .limit(5);

  // Get recent picks activity
  const { data: recentPicks } = await supabase
    .from('picks')
    .select('*, team:teams(name)')
    .order('submitted_at', { ascending: false })
    .limit(5);

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass rounded-xl p-6 card-hover">
          <div className="text-purple-400 text-sm">Teams</div>
          <div className="text-3xl font-bold text-white mt-1">{teamCount || 0}</div>
          <Link href="/admin/teams" className="text-amber-400 text-sm hover:text-amber-300">
            Manage →
          </Link>
        </div>
        <div className="glass rounded-xl p-6 card-hover">
          <div className="text-purple-400 text-sm">Active Drivers</div>
          <div className="text-3xl font-bold text-white mt-1">{driverCount || 0}</div>
          <Link href="/admin/drivers" className="text-amber-400 text-sm hover:text-amber-300">
            Manage →
          </Link>
        </div>
        <div className="glass rounded-xl p-6 card-hover">
          <div className="text-purple-400 text-sm">Races</div>
          <div className="text-3xl font-bold text-white mt-1">
            {completedRaces || 0} / {raceCount || 0}
          </div>
          <Link href="/admin/races" className="text-amber-400 text-sm hover:text-amber-300">
            Manage →
          </Link>
        </div>
        <div className="glass rounded-xl p-6 card-hover">
          <div className="text-purple-400 text-sm">Active Season</div>
          <div className="text-xl font-bold text-white mt-1">
            {activeSeason?.name || 'None'}
          </div>
          <Link href="/admin/seasons" className="text-amber-400 text-sm hover:text-amber-300">
            Manage →
          </Link>
        </div>
      </div>

      {/* Races Needing Results */}
      {racesNeedingResults && racesNeedingResults.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Races Needing Results</h2>
          <div className="space-y-3">
            {racesNeedingResults.map((race) => (
              <div
                key={race.id}
                className="flex items-center justify-between bg-purple-900/20 rounded-lg p-4 border border-purple-700/30"
              >
                <div>
                  <h3 className="text-white font-medium">{race.name}</h3>
                  <p className="text-purple-400 text-sm">{race.track}</p>
                </div>
                <Link
                  href={`/admin/results?race=${race.id}`}
                  className="px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
                >
                  Enter Results
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            href="/admin/races?action=new"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Race
          </Link>
          <Link
            href="/admin/drivers?action=new"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Driver
          </Link>
          <Link
            href="/admin/results"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Enter Results
          </Link>
          <Link
            href="/admin/fix-data"
            className="flex items-center justify-center p-4 bg-amber-500/20 rounded-lg text-amber-300 hover:bg-amber-500/30 transition-colors border border-amber-500/30"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Fix Data Issues
          </Link>
        </div>
      </div>

      {/* Recent Picks */}
      {recentPicks && recentPicks.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Picks Activity</h2>
          <div className="space-y-2">
            {recentPicks.map((pick: any) => (
              <div
                key={pick.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-white">{pick.team?.name}</span>
                <span className="text-purple-400">
                  {new Date(pick.submitted_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
