import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Team, TeamMembership, Profile, Driver, Season, Race } from '@/types';
import { calculateTeamTitsStats } from '@/lib/titsCalculation';
import { SeasonSelector, SEASON_COOKIE_NAME } from '@/components/SeasonSelector';
import { PickStrategyBadge } from '@/components/PickStrategyBadge';
import { calculateDriverTiers } from '@/lib/driverTiers';
import { getPickStrategy } from '@/lib/pickStrategy';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

export default async function TeamProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { season: seasonParam } = await searchParams;
  const cookieStore = await cookies();
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

  // Get all seasons for the selector
  const { data: allSeasons } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false });

  const seasons = (allSeasons || []) as Season[];

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .single();

  // Determine which season to display (from URL param, then cookie, then default to active)
  const seasonCookie = cookieStore.get(SEASON_COOKIE_NAME)?.value;
  const selectedSeasonId = seasonParam || seasonCookie || activeSeason?.id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || activeSeason;

  // Get team's standings
  const { data: standing } = await supabase
    .from('standings')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', selectedSeasonId)
    .is('race_id', null)
    .single();

  // Get team's bonus usages
  const { data: bonus } = await supabase
    .from('team_season_bonuses')
    .select('*')
    .eq('team_id', id)
    .eq('season_id', selectedSeasonId)
    .single();

  // Get all races for selected season
  const { data: racesData } = await supabase
    .from('races')
    .select('*')
    .eq('season_id', selectedSeasonId)
    .order('race_number', { ascending: true });

  const races = (racesData || []) as Race[];

  // Get all picks for this team in selected season
  const { data: picksData } = await supabase
    .from('picks')
    .select(`
      *,
      driver_1:drivers!picks_driver_1_id_fkey(*),
      driver_2:drivers!picks_driver_2_id_fkey(*),
      driver_3:drivers!picks_driver_3_id_fkey(*)
    `)
    .eq('team_id', id)
    .in('race_id', races.map(r => r.id));

  // Get all race results for the selected season
  const { data: raceResultsData } = await supabase
    .from('race_results')
    .select('*')
    .in('race_id', races.map(r => r.id));

  // Build lookup maps
  const picksByRaceId = new Map<string, any>();
  for (const pick of picksData || []) {
    picksByRaceId.set(pick.race_id, pick);
  }

  const resultsByRaceAndDriver = new Map<string, any>();
  for (const result of raceResultsData || []) {
    const key = `${result.race_id}-${result.driver_id}`;
    resultsByRaceAndDriver.set(key, result);
  }

  // Calculate driver tiers for pit strategy
  const driverTiers = await calculateDriverTiers(supabase);

  // Position points lookup
  const POSITION_POINTS: Record<number, number> = {
    1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
  };

  // Calculate driver usage from picks (not driver_usages table)
  // This calculates: times used, total points, avg points, and max potential
  interface CalculatedDriverUsage {
    driver: Driver;
    driverId: string;
    timesUsed: number;
    totalPoints: number;
    avgPoints: number;
    maxPotential: number;
    racesUsed: { raceId: string; points: number }[];
  }

  const driverUsageMap = new Map<string, CalculatedDriverUsage>();

  // First, calculate all race results for each driver (for max potential calculation)
  const driverAllRacePoints = new Map<string, number[]>();
  for (const result of raceResultsData || []) {
    const points = POSITION_POINTS[result.finish_position] || 0;
    // Add stage and laps led bonuses for this driver
    let bonusPoints = 0;
    if (result.stage_1_winner) bonusPoints += 1;
    if (result.stage_2_winner) bonusPoints += 1;
    // Note: laps led bonus is team-level (only 1 per team), but for max potential we include it
    if (result.most_laps_led) bonusPoints += 1;

    const totalDriverPoints = points + bonusPoints;

    if (!driverAllRacePoints.has(result.driver_id)) {
      driverAllRacePoints.set(result.driver_id, []);
    }
    driverAllRacePoints.get(result.driver_id)!.push(totalDriverPoints);
  }

  // Now aggregate from picks
  for (const pick of picksData || []) {
    const race = races.find(r => r.id === pick.race_id);
    if (!race || race.status !== 'final') continue;

    const driversList = [
      { driver: pick.driver_1 as Driver, id: pick.driver_1_id },
      { driver: pick.driver_2 as Driver, id: pick.driver_2_id },
      { driver: pick.driver_3 as Driver, id: pick.driver_3_id },
    ];

    for (const { driver, id } of driversList) {
      if (!driver || !id) continue;

      const resultKey = `${pick.race_id}-${id}`;
      const result = resultsByRaceAndDriver.get(resultKey);

      let points = 0;
      if (result) {
        points = POSITION_POINTS[result.finish_position] || 0;
        // Add stage wins
        if (result.stage_1_winner) points += 1;
        if (result.stage_2_winner) points += 1;
        // Add laps led (individual driver contribution)
        if (result.most_laps_led) points += 1;
      }

      if (!driverUsageMap.has(id)) {
        driverUsageMap.set(id, {
          driver,
          driverId: id,
          timesUsed: 0,
          totalPoints: 0,
          avgPoints: 0,
          maxPotential: 0,
          racesUsed: [],
        });
      }

      const usage = driverUsageMap.get(id)!;
      usage.timesUsed += 1;
      usage.totalPoints += points;
      usage.racesUsed.push({ raceId: pick.race_id, points });
    }
  }

  // Calculate averages and max potential for each driver
  for (const usage of driverUsageMap.values()) {
    usage.avgPoints = usage.timesUsed > 0
      ? Math.round((usage.totalPoints / usage.timesUsed) * 10) / 10
      : 0;

    // Max potential: their X best races (where X = times used)
    const allPoints = driverAllRacePoints.get(usage.driverId) || [];
    const sortedPoints = [...allPoints].sort((a, b) => b - a);
    const bestRaces = sortedPoints.slice(0, usage.timesUsed);
    usage.maxPotential = bestRaces.reduce((sum, pts) => sum + pts, 0);
  }

  // Convert to sorted array
  const calculatedDriverUsages = Array.from(driverUsageMap.values())
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Calculate points for each race
  interface RacePickData {
    race: Race;
    pick: any | null;
    drivers: {
      driver: Driver;
      points: number;
      position: number | null;
      stageWins: number;
      lapsLed: boolean;
    }[];
    totalPoints: number;
    stageBonus: number;
    lapsLedBonus: number;
    top10Bonus: number;
    strategy: ReturnType<typeof getPickStrategy> | null;
  }

  const racePicksData: RacePickData[] = races
    .filter(race => race.status === 'final' || picksByRaceId.has(race.id))
    .map(race => {
      const pick = picksByRaceId.get(race.id);

      if (!pick) {
        return {
          race,
          pick: null,
          drivers: [],
          totalPoints: 0,
          stageBonus: 0,
          lapsLedBonus: 0,
          top10Bonus: 0,
          strategy: null,
        };
      }

      const driversList = [
        { driver: pick.driver_1, id: pick.driver_1_id },
        { driver: pick.driver_2, id: pick.driver_2_id },
        { driver: pick.driver_3, id: pick.driver_3_id },
      ];

      let totalPoints = 0;
      let stageBonus = 0;
      let lapsLedBonus = 0;
      let allTop10 = true;

      const drivers = driversList.map(({ driver, id }) => {
        const resultKey = `${race.id}-${id}`;
        const result = resultsByRaceAndDriver.get(resultKey);

        let points = 0;
        let position: number | null = null;
        let stageWins = 0;
        let lapsLed = false;

        if (result) {
          position = result.finish_position;
          points = POSITION_POINTS[result.finish_position] || 0;

          if (result.stage_1_winner) {
            stageWins++;
            stageBonus++;
          }
          if (result.stage_2_winner) {
            stageWins++;
            stageBonus++;
          }
          if (result.most_laps_led) {
            lapsLed = true;
            if (lapsLedBonus === 0) {
              lapsLedBonus = 1;
            }
          }
          if (result.finish_position > 10) {
            allTop10 = false;
          }
        } else {
          allTop10 = false;
        }

        totalPoints += points;

        return {
          driver,
          points,
          position,
          stageWins,
          lapsLed,
        };
      });

      const top10Bonus = allTop10 && race.status === 'final' ? 1 : 0;
      totalPoints += stageBonus + lapsLedBonus + top10Bonus;

      // Calculate pit strategy
      const tierValues = driversList.map(({ id }) => driverTiers.get(id) || 3);
      const strategy = getPickStrategy(tierValues);

      return {
        race,
        pick,
        drivers,
        totalPoints,
        stageBonus,
        lapsLedBonus,
        top10Bonus,
        strategy,
      };
    });

  const owners = team.team_memberships?.filter((m: any) => m.role === 'owner') || [];
  const members = team.team_memberships?.filter((m: any) => m.role === 'member') || [];
  const bonusUses = bonus?.bonus_usages ?? 1;
  const favoriteDriver = team.favorite_driver as Driver | null;

  // Calculate TITS stats
  const titsStats = selectedSeasonId
    ? await calculateTeamTitsStats(supabase, id, selectedSeasonId)
    : null;

  return (
    <div className="space-y-8">
      {/* Season Selector */}
      {seasons.length > 0 && selectedSeasonId && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {selectedSeason?.name} Season
            </h2>
          </div>
          <SeasonSelector
            seasons={seasons}
            currentSeasonId={selectedSeasonId}
            basePath={`/teams/${id}`}
          />
        </div>
      )}

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
        <h2 className="text-xl font-bold text-white mb-4">Driver Usage & Performance</h2>
        {calculatedDriverUsages.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Driver</th>
                  <th className="pb-3 text-center">Uses</th>
                  <th className="pb-3 text-center">Total Pts</th>
                  <th className="pb-3 text-center">Avg Pts</th>
                  <th className="pb-3 text-center">Max Potential</th>
                  <th className="pb-3 text-center">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {calculatedDriverUsages.map((usage) => {
                  const efficiency = usage.maxPotential > 0
                    ? Math.round((usage.totalPoints / usage.maxPotential) * 100)
                    : 0;
                  const pointsLeft = usage.maxPotential - usage.totalPoints;

                  return (
                    <tr key={usage.driverId} className="border-b border-gray-700/50">
                      <td className="py-3 pr-4 text-yellow-500 font-bold">
                        {usage.driver?.car_number}
                      </td>
                      <td className="py-3 pr-4">
                        <div>
                          <span className="text-white">{usage.driver?.name}</span>
                          <span className="text-gray-500 text-xs ml-2">{usage.driver?.team_name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${
                          usage.timesUsed >= 4 ? 'text-red-400' :
                          usage.timesUsed >= 3 ? 'text-yellow-400' : 'text-white'
                        }`}>
                          {usage.timesUsed}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="font-bold text-amber-400">{usage.totalPoints}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-medium ${
                          usage.avgPoints >= 8 ? 'text-emerald-400' :
                          usage.avgPoints >= 5 ? 'text-amber-400' :
                          usage.avgPoints >= 3 ? 'text-gray-300' : 'text-red-400'
                        }`}>
                          {usage.avgPoints.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-cyan-400 font-medium">{usage.maxPotential}</span>
                          {pointsLeft > 0 && (
                            <span className="text-xs text-gray-500">
                              (-{pointsLeft})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`font-bold ${
                          efficiency >= 90 ? 'text-emerald-400' :
                          efficiency >= 70 ? 'text-amber-400' :
                          efficiency >= 50 ? 'text-gray-300' : 'text-red-400'
                        }`}>
                          {efficiency}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
              <p><strong>Max Potential:</strong> Points from their {calculatedDriverUsages[0]?.timesUsed || 'X'} best races that season</p>
              <p><strong>Efficiency:</strong> Actual points vs max potential (did you pick them in their best races?)</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400">No drivers have been used yet this season.</p>
        )}
      </div>

      {/* Race-by-Race Picks */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Season Picks & Results
        </h2>
        {racePicksData.length > 0 ? (
          <div className="space-y-4">
            {racePicksData.map(({ race, pick, drivers, totalPoints, stageBonus, lapsLedBonus, top10Bonus, strategy }) => (
              <div
                key={race.id}
                className={`border rounded-lg p-4 ${
                  race.status === 'final'
                    ? 'border-gray-700 bg-gray-900/50'
                    : 'border-purple-700/50 bg-purple-900/20'
                }`}
              >
                {/* Race Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-400 font-bold">#{race.race_number}</span>
                    <Link
                      href={`/races/${race.id}`}
                      className="text-white font-medium hover:text-amber-400 transition-colors"
                    >
                      {race.name}
                    </Link>
                    {strategy && (
                      <PickStrategyBadge strategy={strategy} size="sm" />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {race.status === 'final' ? (
                      <span className="text-2xl font-bold text-amber-400">{totalPoints} pts</span>
                    ) : (
                      <span className="text-sm text-purple-400">
                        {race.status === 'upcoming' ? 'Upcoming' : 'In Progress'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Drivers Grid */}
                {pick ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {drivers.map(({ driver, points, position, stageWins, lapsLed }, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold text-sm">
                            #{driver?.car_number}
                          </span>
                          <span className="text-white text-sm truncate max-w-[120px]">
                            {driver?.name?.split(' ').pop()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {race.status === 'final' && (
                            <>
                              {position && (
                                <span className={`text-xs ${
                                  position <= 10 ? 'text-emerald-400' : 'text-gray-500'
                                }`}>
                                  P{position}
                                </span>
                              )}
                              {stageWins > 0 && (
                                <span className="text-xs text-purple-400" title="Stage wins">
                                  +{stageWins}S
                                </span>
                              )}
                              {lapsLed && (
                                <span className="text-xs text-cyan-400" title="Most laps led">
                                  +L
                                </span>
                              )}
                              <span className={`font-bold ${
                                points >= 8 ? 'text-emerald-400' :
                                points >= 5 ? 'text-amber-400' :
                                points > 0 ? 'text-gray-300' : 'text-gray-500'
                              }`}>
                                {points}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No picks submitted</p>
                )}

                {/* Bonuses Row */}
                {race.status === 'final' && pick && (stageBonus > 0 || lapsLedBonus > 0 || top10Bonus > 0) && (
                  <div className="mt-2 pt-2 border-t border-gray-700/50 flex flex-wrap gap-3 text-xs">
                    {stageBonus > 0 && (
                      <span className="text-purple-400">
                        Stage Bonus: +{stageBonus}
                      </span>
                    )}
                    {lapsLedBonus > 0 && (
                      <span className="text-cyan-400">
                        Laps Led: +{lapsLedBonus}
                      </span>
                    )}
                    {top10Bonus > 0 && (
                      <span className="text-emerald-400">
                        All Top 10: +{top10Bonus}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400">No picks for this season yet.</p>
        )}
      </div>
    </div>
  );
}
