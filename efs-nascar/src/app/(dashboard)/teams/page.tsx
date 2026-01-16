import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile, Driver } from '@/types';
import { calculateAllTeamsTitsStats, TitsStats } from '@/lib/titsCalculation';

interface TeamWithOwners extends Team {
  team_memberships: (TeamMembership & { profile: Profile })[];
  favorite_driver?: Driver | null;
}

export default async function TeamsPage() {
  const supabase = await createClient();

  // Get current user and their team
  const { data: { user } } = await supabase.auth.getUser();
  let userTeamId: string | undefined;

  if (user) {
    const { data: membership } = await supabase
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', user.id)
      .single();
    userTeamId = membership?.team_id;
  }

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .single();

  // Get all teams with their owners and favorite driver
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      *,
      team_memberships(
        *,
        profile:profiles(*)
      ),
      favorite_driver:drivers(*)
    `)
    .order('car_number', { ascending: true });

  // Calculate TITS stats for all teams
  // Use revealedOnly=true so other teams' unrevealed picks aren't exposed
  // Pass userTeamId so the logged-in user can see their own full stats
  let titsStatsByTeam = new Map<string, TitsStats>();
  if (activeSeason) {
    titsStatsByTeam = await calculateAllTeamsTitsStats(supabase, activeSeason.id, true, userTeamId);
  }

  // Get next upcoming race for pick submission check
  let nextRaceId: string | null = null;
  if (activeSeason) {
    const { data: nextRace } = await supabase
      .from('races')
      .select('id')
      .eq('season_id', activeSeason.id)
      .eq('status', 'upcoming')
      .gt('deadline_datetime', new Date().toISOString())
      .order('scheduled_datetime', { ascending: true })
      .limit(1)
      .single();
    nextRaceId = nextRace?.id || null;
  }

  // Get pick submission status for the upcoming race
  const picksSubmittedByTeam = new Set<string>();
  if (nextRaceId) {
    const { data: picks } = await supabase
      .from('picks')
      .select('team_id')
      .eq('race_id', nextRaceId);
    (picks || []).forEach(p => picksSubmittedByTeam.add(p.team_id));
  }

  // Calculate Zig% (contrarian score) for all teams
  const zigPercentByTeam = new Map<string, number>();
  if (activeSeason) {
    // Get revealed races
    const { data: revealedRaces } = await supabase
      .from('races')
      .select('id')
      .eq('season_id', activeSeason.id)
      .or(`status.eq.in_progress,status.eq.final,deadline_datetime.lt.${new Date().toISOString()}`);

    const revealedRaceIds = new Set((revealedRaces || []).map(r => r.id));

    if (revealedRaceIds.size > 0) {
      // Get all picks from revealed races
      const { data: allRevealedPicks } = await supabase
        .from('picks')
        .select('team_id, race_id, driver_1_id, driver_2_id, driver_3_id')
        .in('race_id', Array.from(revealedRaceIds));

      if (allRevealedPicks && allRevealedPicks.length > 0) {
        // Count how many teams picked each driver per race
        const driverPickCountsByRace: Record<string, Record<string, number>> = {};
        const teamCountByRace: Record<string, number> = {};

        for (const pick of allRevealedPicks) {
          if (!driverPickCountsByRace[pick.race_id]) {
            driverPickCountsByRace[pick.race_id] = {};
            teamCountByRace[pick.race_id] = 0;
          }
          teamCountByRace[pick.race_id]++;
          [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach(driverId => {
            if (driverId) {
              driverPickCountsByRace[pick.race_id][driverId] = (driverPickCountsByRace[pick.race_id][driverId] || 0) + 1;
            }
          });
        }

        // Calculate contrarian score for each team
        const getPopularityLevel = (count: number, totalTeams: number): string => {
          const percentage = (count / totalTeams) * 100;
          if (count === 1) return 'unique';
          if (percentage <= 20) return 'rare';
          if (percentage <= 35) return 'uncommon';
          if (percentage <= 50) return 'common';
          if (percentage <= 70) return 'popular';
          return 'chalk';
        };

        const contrarianWeights: Record<string, number> = {
          unique: 100, rare: 80, uncommon: 60, common: 40, popular: 20, chalk: 0,
        };

        // Group picks by team
        const picksByTeam: Record<string, typeof allRevealedPicks> = {};
        for (const pick of allRevealedPicks) {
          if (!picksByTeam[pick.team_id]) picksByTeam[pick.team_id] = [];
          picksByTeam[pick.team_id].push(pick);
        }

        for (const [teamId, teamPicks] of Object.entries(picksByTeam)) {
          let totalWeight = 0;
          let pickCount = 0;

          for (const pick of teamPicks) {
            const totalTeams = teamCountByRace[pick.race_id] || 1;
            const driverCounts = driverPickCountsByRace[pick.race_id] || {};

            [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach(driverId => {
              if (driverId) {
                const count = driverCounts[driverId] || 1;
                const level = getPopularityLevel(count, totalTeams);
                totalWeight += contrarianWeights[level];
                pickCount++;
              }
            });
          }

          if (pickCount > 0) {
            zigPercentByTeam.set(teamId, Math.round(totalWeight / pickCount));
          }
        }
      }
    }
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
          const zigPercent = zigPercentByTeam.get(team.id);
          const hasSubmittedPicks = picksSubmittedByTeam.has(team.id);
          const favoriteDriver = team.favorite_driver;

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
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white truncate">{team.name}</h2>
                    {/* Pick submission indicator */}
                    {nextRaceId && (
                      <span className={`w-2 h-2 rounded-full ${hasSubmittedPicks ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}
                        title={hasSubmittedPicks ? 'Picks submitted' : 'Picks not submitted'}
                      />
                    )}
                  </div>
                  <p className="text-purple-400 text-sm">
                    {owners.length > 0
                      ? owners.map((o) => o.profile?.name).join(', ')
                      : 'No owner assigned'}
                  </p>
                  {/* Favorite driver */}
                  {favoriteDriver && (
                    <p className="text-xs text-purple-500 mt-1">
                      Favorite: #{favoriteDriver.car_number} {favoriteDriver.name.split(' ').slice(-1)[0]}
                    </p>
                  )}
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {titsStats && (
                      <>
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
                          TITS%: {titsStats.titsPercent.toFixed(0)}%
                        </span>
                      </>
                    )}
                    {zigPercent !== undefined && (
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded ${
                        zigPercent >= 60
                          ? 'bg-green-500/20 text-green-400'
                          : zigPercent >= 40
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        Zig: {zigPercent}%
                      </span>
                    )}
                  </div>
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
