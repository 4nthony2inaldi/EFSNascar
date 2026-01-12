import { createClient } from '@/lib/supabase/server';
import DriverUsageTable from './DriverUsageTable';
import type { Season } from '@/types';

export const dynamic = 'force-dynamic';

// Position points: 1st=10, 2nd=9, ..., 10th=1, 11th+=0
const POSITION_POINTS: Record<number, number> = {
  1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
  6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
};

// Weight multipliers for races:
// Most recent 30 races: 3x
// Next 30 races: 2x
// Oldest 30 races: 1x
function getWeightForRaceIndex(index: number): number {
  if (index < 30) return 3;
  if (index < 60) return 2;
  return 1;
}

// Calculate fantasy points for a single race result
function calculateFantasyPoints(
  finishPosition: number,
  stage1Winner: boolean,
  stage2Winner: boolean,
  mostLapsLed: boolean
): number {
  let points = POSITION_POINTS[finishPosition] || 0;
  if (stage1Winner) points += 1;
  if (stage2Winner) points += 1;
  if (mostLapsLed) points += 1;
  return points;
}

export interface TeamWithOwner {
  id: string;
  name: string;
  car_number: number;
  owner_name: string;
}

export interface DriverWithStats {
  driver_id: string;
  driver_name: string;
  car_number: number;
  team_name: string | null;
  weighted_fantasy_points: number;
  tier: number;
}

export interface SeasonOption {
  id: string;
  name: string;
  year: number;
  is_active: boolean;
}

interface PageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function DriverUsagePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  // Step 1: Get all seasons
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, name, year, is_active')
    .order('year', { ascending: false });

  if (!seasons || seasons.length === 0) {
    return <ErrorDisplay message="No seasons found" />;
  }

  const seasonOptions: SeasonOption[] = seasons.map(s => ({
    id: s.id,
    name: s.name,
    year: s.year,
    is_active: s.is_active,
  }));

  // Determine selected season (from URL param or default to active)
  const activeSeason = seasons.find(s => s.is_active);
  const selectedSeasonId = params.season || activeSeason?.id || seasons[0].id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || seasons[0];

  // Step 2: Get all teams with their owners
  const { data: teams } = await supabase
    .from('teams')
    .select(`
      id,
      name,
      car_number,
      team_memberships(
        role,
        profile:profiles(name)
      )
    `)
    .order('car_number', { ascending: true });

  const teamsWithOwners: TeamWithOwner[] = (teams || []).map((team: any) => {
    const owners = team.team_memberships?.filter((m: any) => m.role === 'owner') || [];
    const ownerName = owners.length > 0
      ? owners.map((o: any) => o.profile?.name?.split(' ')[0] || 'Unknown').join('/')
      : 'No Owner';
    return {
      id: team.id,
      name: team.name,
      car_number: team.car_number,
      owner_name: ownerName,
    };
  });

  // Step 3: Get races for the selected season that have revealed picks
  // Picks are revealed when: deadline has passed OR race status is 'in_progress' or 'final'
  const now = new Date().toISOString();

  const { data: revealedRaces } = await supabase
    .from('races')
    .select('id')
    .eq('season_id', selectedSeasonId)
    .or(`deadline_datetime.lt.${now},status.eq.in_progress,status.eq.final`);

  const revealedRaceIds = new Set((revealedRaces || []).map(r => r.id));

  // Step 4: Get all picks for the selected season, but only count those from revealed races
  const { data: allPicks } = await supabase
    .from('picks')
    .select(`
      team_id,
      race_id,
      driver_1_id,
      driver_2_id,
      driver_3_id,
      race:races!inner(season_id)
    `)
    .eq('races.season_id', selectedSeasonId);

  // Build usage map: driver_id -> team_id -> count (only from revealed races)
  const usageMap: Record<string, Record<string, number>> = {};
  allPicks?.forEach((pick: any) => {
    // Only count picks from races where picks are revealed
    if (!revealedRaceIds.has(pick.race_id)) {
      return;
    }

    const teamId = pick.team_id;
    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
      if (!usageMap[driverId]) {
        usageMap[driverId] = {};
      }
      usageMap[driverId][teamId] = (usageMap[driverId][teamId] || 0) + 1;
    });
  });

  // Step 5: Get driver rankings data (similar to driver-rankings page)
  // Get the 90 most recent races with status = 'final'
  const { data: races } = await supabase
    .from('races')
    .select('id, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  if (!races || races.length === 0) {
    return <EmptyState
      teamsWithOwners={teamsWithOwners}
      seasons={seasonOptions}
      selectedSeasonId={selectedSeasonId}
    />;
  }

  const raceIds = races.map(r => r.id);

  // Create a map of race_id to its recency index
  const raceIndexMap = new Map<string, number>();
  races.forEach((race, index) => {
    raceIndexMap.set(race.id, index);
  });

  // Get all race results
  let allResults: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pageResults } = await supabase
      .from('race_results')
      .select(`
        race_id,
        driver_id,
        finish_position,
        stage_1_winner,
        stage_2_winner,
        most_laps_led,
        api_driver_name,
        api_car_number
      `)
      .in('race_id', raceIds)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!pageResults || pageResults.length === 0) break;
    allResults = allResults.concat(pageResults);
    if (pageResults.length < pageSize) break;
    page++;
  }

  // Get all drivers for lookup
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name')
    .eq('is_active', true);

  const driverMap = new Map<string, { id: string; name: string; car_number: number; team_name: string | null }>();
  for (const driver of drivers || []) {
    driverMap.set(driver.id, {
      id: driver.id,
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name,
    });
  }

  // Also create a map by name for race results
  const driverByName = new Map<string, string>(); // name -> id
  for (const driver of drivers || []) {
    driverByName.set(driver.name, driver.id);
  }

  // Aggregate stats by driver name
  const statsByName: Record<string, {
    driver_id: string;
    driver_name: string;
    car_number: number;
    team_name: string | null;
    weighted_fantasy_points: number;
    total_weight: number;
    recent_races: number;
  }> = {};

  // Track recent race counts (for tier eligibility)
  const MIN_RECENT_RACES_FOR_TIER = 15;
  const recentRaceIds = new Set(races.slice(0, 30).map(r => r.id));

  for (const result of allResults) {
    let driverName = result.api_driver_name;
    let carNumber = result.api_car_number;
    let teamName: string | null = null;
    let driverId = result.driver_id;

    if (!driverName && result.driver_id) {
      const driver = driverMap.get(result.driver_id);
      if (driver) {
        driverName = driver.name;
        carNumber = carNumber || driver.car_number;
        teamName = driver.team_name;
        driverId = driver.id;
      }
    }

    if (!driverName) continue;

    // Get driver ID from name if we only have name
    if (!driverId && driverName) {
      driverId = driverByName.get(driverName) || '';
    }

    if (!statsByName[driverName]) {
      const driver = driverMap.get(driverId);
      statsByName[driverName] = {
        driver_id: driverId,
        driver_name: driverName,
        car_number: driver?.car_number || carNumber || 0,
        team_name: driver?.team_name || teamName,
        weighted_fantasy_points: 0,
        total_weight: 0,
        recent_races: 0,
      };
    }

    const stats = statsByName[driverName];

    // Calculate fantasy points for this race
    const raceFantasyPoints = calculateFantasyPoints(
      result.finish_position || 0,
      result.stage_1_winner || false,
      result.stage_2_winner || false,
      result.most_laps_led || false
    );

    // Get weight for this race based on recency
    const raceIndex = raceIndexMap.get(result.race_id) ?? 90;
    const weight = getWeightForRaceIndex(raceIndex);

    stats.weighted_fantasy_points += raceFantasyPoints * weight;
    stats.total_weight += weight;

    // Count recent races for tier eligibility
    if (recentRaceIds.has(result.race_id)) {
      stats.recent_races += 1;
    }
  }

  // Filter to full-time drivers and sort by WFPT
  const fullTimeDrivers = Object.values(statsByName)
    .filter(d => d.recent_races >= MIN_RECENT_RACES_FOR_TIER)
    .sort((a, b) => b.weighted_fantasy_points - a.weighted_fantasy_points);

  // Assign tiers (6 per tier)
  const tierMap = new Map<string, number>();
  fullTimeDrivers.forEach((driver, index) => {
    const tier = Math.floor(index / 6) + 1;
    tierMap.set(driver.driver_name, tier);
  });

  // Create final driver list sorted by WFPT (include all active drivers)
  const driversWithStats: DriverWithStats[] = (drivers || [])
    .map(driver => {
      const stats = statsByName[driver.name];
      return {
        driver_id: driver.id,
        driver_name: driver.name,
        car_number: driver.car_number,
        team_name: driver.team_name,
        weighted_fantasy_points: stats?.weighted_fantasy_points || 0,
        tier: tierMap.get(driver.name) || 0,
      };
    })
    .sort((a, b) => b.weighted_fantasy_points - a.weighted_fantasy_points);

  // Count revealed races for display
  const revealedRaceCount = revealedRaceIds.size;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Usage</h1>
        <p className="text-purple-400 mt-1">
          Driver usage across all teams ({revealedRaceCount} race{revealedRaceCount !== 1 ? 's' : ''} revealed)
        </p>
      </div>

      <DriverUsageTable
        drivers={driversWithStats}
        teams={teamsWithOwners}
        usageMap={usageMap}
        seasons={seasonOptions}
        selectedSeasonId={selectedSeasonId}
      />

      {/* Legend */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Legend</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-purple-300">
          <div>
            <span className="text-amber-400 font-semibold">WFPts:</span> Weighted fantasy points (recent 30 races = 3x, next 30 = 2x, oldest 30 = 1x)
          </div>
          <div>
            <span className="text-fuchsia-400 font-semibold">Tier:</span> Driver tier based on WFPts (6 drivers per tier, Tier 1 = best)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 bg-red-500/40 rounded"></span>
            <span>4+ uses (maxed or near max)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 bg-red-500/20 rounded"></span>
            <span>1-3 uses</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-purple-800/30 text-sm text-purple-400">
          Note: Only picks from races where the deadline has passed are shown. Upcoming race picks remain hidden until their deadline.
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  teamsWithOwners,
  seasons,
  selectedSeasonId
}: {
  teamsWithOwners: TeamWithOwner[];
  seasons: SeasonOption[];
  selectedSeasonId: string;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Usage</h1>
        <p className="text-purple-400 mt-1">Driver usage across all teams</p>
      </div>

      {/* Season Selector */}
      <div className="glass rounded-xl p-4">
        <label className="block text-sm font-medium text-purple-200 mb-2">
          Select Season
        </label>
        <select
          defaultValue={selectedSeasonId}
          onChange={(e) => {
            window.location.href = `/driver-usage?season=${e.target.value}`;
          }}
          className="w-full max-w-xs px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name} {season.is_active ? '(Current)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="glass rounded-xl p-12 text-center">
        <p className="text-purple-300">No race results available yet.</p>
        <p className="text-purple-500 text-sm mt-2">
          Driver rankings will appear once races have been completed.
        </p>
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Usage</h1>
      </div>
      <div className="glass rounded-xl p-12 text-center border border-red-500/30">
        <p className="text-red-400">{message}</p>
      </div>
    </div>
  );
}
