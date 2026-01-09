import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile } from '@/types';

interface TeamWithOwners extends Team {
  team_memberships: (TeamMembership & { profile: Profile })[];
}

export default async function TeamsPage() {
  const supabase = await createClient();

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Teams</h1>
        <p className="text-gray-400 mt-1">All 17 teams in the EFS NASCAR Fantasy League</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams?.map((team: TeamWithOwners) => {
          const owners = team.team_memberships?.filter((m) => m.role === 'owner') || [];

          return (
            <Link
              key={team.id}
              href={`/teams/${team.id}`}
              className="bg-gray-800 rounded-lg p-6 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-yellow-500/50"
            >
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-yellow-500">
                      #{team.car_number}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-white truncate">{team.name}</h2>
                  <p className="text-gray-400 text-sm">
                    {owners.length > 0
                      ? owners.map((o) => o.profile?.name).join(', ')
                      : 'No owner assigned'}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {(!teams || teams.length === 0) && (
        <div className="text-center py-12">
          <p className="text-gray-400">No teams have been created yet.</p>
        </div>
      )}
    </div>
  );
}
