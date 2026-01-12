import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile, DriverUsage, Driver } from '@/types';
import { calculateTeamTitsStats } from '@/lib/titsCalculation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeamProfilePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Get team with members and favorite driver
  const { data: team, error } = await supabase
    .from('teams')
    .select(`
      *,
      team_memberships(
        *,
        profile:profiles(*)
      ),
      favorite_driver:drivers(*)
    `)
    .eq('id', id)
    .single();

  if (error || !team) {
    notFound();
  }

  // Check if current user is an owner of this team
  const isOwner = team.team_memberships?.some(
    (m: TeamMembership & { profile: Profile }) =>
      m.user_id === user?.id && m.role === 'owner'
  );

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Get driver usages for this team in active season
  let driverUsages: (DriverUsage & { driver: Driver })[] = [];
  if (activeSeason) {
    const { data: usages } = await supabase
      .from('driver_usages')
      .select('*, driver:drivers(*)')
      .eq('team_id', id)
      .eq('season_id', activeSeason.id)
      .order('times_used', { ascending: false });
    driverUsages = usages || [];
  }

  // Get team's standings
  const { data: standing } = await supabase
    .from('standings')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', activeSeason?.id)
    .is('race_id', null)
    .single();

  // Get team's bonus usages
  const { data: bonus } = await supabase
    .from('team_season_bonuses')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', activeSeason?.id)
    .single();

  const owners = team.team_memberships?.filter((m: any) => m.role === 'owner') || [];
  const members = team.team_memberships?.filter((m: any) => m.role === 'member') || [];
  const bonusUses = bonus?.bonus_usages ?? 1;
  const favoriteDriver = team.favorite_driver as Driver | null;

  // Calculate TITS stats
  const titsStats = activeSeason
    ? await calculateTeamTitsStats(supabase, id, activeSeason.id)
    : null;

  return (
    <div className="space-y-8">
      {/* Team Header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              {team.logo_url ? (
                <img
                  src={team.logo_url}
                  alt={team.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-4xl font-bold text-yellow-500">#{team.car_number}</span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-white">{team.name}</h1>
                <span className="px-3 py-1 bg-yellow-500 text-black font-bold rounded-full text-sm">
                  #{team.car_number}
                </span>
              </div>
              <p className="text-gray-400 mt-1">
                Owner{owners.length > 1 ? 's' : ''}:{' '}
                {owners.map((o: any) => o.profile?.name).join(', ') || 'None assigned'}
              </p>
              {isOwner && (
                <span className="inline-block mt-2 px-3 py-1 bg-green-500/20 text-green-500 text-sm rounded-full">
                  You own this team
                </span>
              )}
            </div>
          </div>
          {isOwner && (
            <Link
              href={`/teams/${id}/edit`}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Edit Profile
            </Link>
          )}
        </div>

        {/* Quote */}
        {team.quote && (
          <div className="mt-6 pl-4 border-l-4 border-yellow-500">
            <p className="text-lg text-gray-300 italic">"{team.quote}"</p>
          </div>
        )}
      </div>

      {/* Owner Headshot & Bio */}
      {(team.owner_headshot_url || team.bio || favoriteDriver) && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">About the Team</h2>
          <div className="flex flex-col md:flex-row gap-6">
            {team.owner_headshot_url && (
              <div className="flex-shrink-0">
                <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-700">
                  <img
                    src={team.owner_headshot_url}
                    alt="Team Owner"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
            <div className="flex-1 space-y-4">
              {team.bio && (
                <p className="text-gray-300 whitespace-pre-wrap">{team.bio}</p>
              )}
              {favoriteDriver && (
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400">Favorite Driver:</span>
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded font-medium">
                    #{favoriteDriver.car_number} {favoriteDriver.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Season Stats */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Season Stats</h2>
          {standing ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Rank</span>
                <span className={`text-2xl font-bold ${
                  (standing.rank || 0) <= 6 ? 'text-green-500' :
                  standing.rank === 7 ? 'text-yellow-500' : 'text-white'
                }`}>
                  #{standing.rank || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Points</span>
                <span className="text-2xl font-bold text-white">{standing.total_points}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Race Wins Picked</span>
                <span className="text-lg text-white">{standing.race_wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stage Wins Picked</span>
                <span className="text-lg text-white">{standing.stage_wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Top 10 Bonuses</span>
                <span className="text-lg text-white">{standing.top_10_bonuses}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No stats available yet.</p>
          )}
        </div>

        {/* TITS Remaining */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">TITS Remaining</h2>
          {titsStats ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tier 1 Remaining</span>
                <span className="text-xl font-bold text-amber-400">{titsStats.t1Remaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Tier 2 Remaining</span>
                <span className="text-xl font-bold text-emerald-400">{titsStats.t2Remaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total TITS</span>
                <span className="text-2xl font-bold text-amber-500">{titsStats.titsRemaining}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">TITS %</span>
                <span className={`text-2xl font-bold ${
                  titsStats.titsPercent >= 50 ? 'text-green-500' :
                  titsStats.titsPercent >= 30 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {titsStats.titsPercent.toFixed(1)}%
                </span>
              </div>
              <div className="pt-2 border-t border-gray-700">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Picks Remaining</span>
                  <span className="text-gray-400">{titsStats.totalPicksRemaining}</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-500">5th Use Bonus</span>
                  <span className={`font-medium ${titsStats.bonusUsed ? 'text-red-400' : 'text-green-400'}`}>
                    {titsStats.bonusUsed ? 'Used' : 'Available'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No active season.</p>
          )}
        </div>

        {/* Team Members */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Team Members</h2>
          <div className="space-y-3">
            {owners.map((membership: any) => (
              <div key={membership.id} className="flex items-center justify-between">
                <span className="text-white">{membership.profile?.name}</span>
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs rounded">
                  Owner
                </span>
              </div>
            ))}
            {members.map((membership: any) => (
              <div key={membership.id} className="flex items-center justify-between">
                <span className="text-white">{membership.profile?.name}</span>
                <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                  Member
                </span>
              </div>
            ))}
            {team.team_memberships?.length === 0 && (
              <p className="text-gray-400 text-sm">No members assigned to this team.</p>
            )}
          </div>
        </div>
      </div>

      {/* Driver Usage */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Driver Usage</h2>
        {driverUsages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Driver</th>
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 text-center">Uses</th>
                  <th className="pb-3 text-center">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {driverUsages.map((usage) => {
                  const maxUses = usage.times_used >= 4 ? 4 + bonusUses : 4;
                  const remaining = maxUses - usage.times_used;
                  return (
                    <tr key={usage.id} className="border-b border-gray-700/50">
                      <td className="py-3 pr-4 text-yellow-500 font-bold">
                        {usage.driver?.car_number}
                      </td>
                      <td className="py-3 pr-4 text-white">{usage.driver?.name}</td>
                      <td className="py-3 pr-4 text-gray-400">{usage.driver?.team_name}</td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${
                          usage.times_used >= 4 ? 'text-red-500' :
                          usage.times_used >= 3 ? 'text-yellow-500' : 'text-white'
                        }`}>
                          {usage.times_used}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${
                          remaining === 0 ? 'text-red-500' :
                          remaining === 1 ? 'text-yellow-500' : 'text-green-500'
                        }`}>
                          {remaining}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400">No drivers have been used yet this season.</p>
        )}
      </div>
    </div>
  );
}
