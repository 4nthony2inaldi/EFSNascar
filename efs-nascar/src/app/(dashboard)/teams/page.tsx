import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile } from '@/types';
import { calculateAllTeamsTitsStats, TitsStats } from '@/lib/titsCalculation';

interface TeamWithOwners extends Team {
  team_memberships: (TeamMembership & { profile: Profile })[];
}

export default async function TeamsPage() {
  const supabase = await createClient();

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  // Get all teams with their owners
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      *,
      team_memberships(
        *,
        profile:profiles(*)
      )
    `)
    .order('car_number', { ascending: true });

  // Calculate TITS stats for all teams
  let titsStatsByTeam = new Map<string, TitsStats>();
  if (activeSeason) {
    titsStatsByTeam = await calculateAllTeamsTitsStats(supabase, activeSeason.id);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Teams</h1>
        <p className="text-purple-400 mt-1">All 17 teams in the EFS NASCAR Fantasy League</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams?.map((team: TeamWithOwners) => {
          const owners = team.team_memberships?.filter((m) => m.role === 'owner') || [];
          const titsStats = titsStatsByTeam.get(team.id);

          return (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="glass rounded-xl p-6 card-hover border border-purple-700/30 hover:border-amber-400/50"
            >
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-purple-800/30 border border-purple-500/30 rounded-full flex items-center justify-center flex-shrink-0">
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                      #{team.car_number}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white truncate">{team.name}</h2>
                  <p className="text-purple-400 text-sm">
                    {owners.length > 0
                      ? owners.map((o) => o.profile?.name).join(', ')
                      : 'No owner assigned'}
                  </p>
                  {titsStats && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded">
                        TITS: {titsStats.titsRemaining}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        titsStats.titsPercent >= 50
                          ? 'bg-green-500/20 text-green-400'
                          : titsStats.titsPercent >= 30
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        TITS%: {titsStats.titsPercent.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {(!teams || teams.length === 0) && (
        <div className="text-center py-12">
          <p className="text-purple-400">No teams have been created yet.</p>
        </div>
      )}
    </div>
  );
}
