import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Position points: 1st=10, 2nd=9, ..., 10th=1, 11th+=0
const POSITION_POINTS: Record<number, number> = {
  1: 10, 2: 9, 3: 8, 4: 7, 5: 6,
  6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
};

// Weight multipliers for races
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

// Tier badge colors
function getTierColor(tier: number): string {
  switch (tier) {
    case 1: return 'bg-amber-500 text-black';
    case 2: return 'bg-emerald-500 text-black';
    case 3: return 'bg-cyan-500 text-black';
    case 4: return 'bg-purple-500 text-white';
    case 5: return 'bg-pink-500 text-white';
    case 6: return 'bg-indigo-500 text-white';
    default: return 'bg-gray-600 text-white';
  }
}

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function DriverPage({ params }: PageProps) {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  const supabase = await createClient();

  // Get all race results for this driver name (using api_driver_name)
  // Also get results by driver_id for drivers table lookup
  const { data: driverRecord } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name, is_active')
    .ilike('name', decodedName)
    .single();

  // Get results by api_driver_name OR by driver_id
  let allResults: any[] = [];

  // First, get by api_driver_name
  const { data: resultsByApiName } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      stage_1_winner,
      stage_2_winner,
      most_laps_led,
      laps_led,
      api_driver_name,
      api_car_number
    `)
    .ilike('api_driver_name', decodedName);

  if (resultsByApiName) {
    allResults = [...resultsByApiName];
  }

  // Also get by driver_id if we found a driver record
  if (driverRecord) {
    const { data: resultsByDriverId } = await supabase
      .from('race_results')
      .select(`
        id,
        race_id,
        driver_id,
        finish_position,
        stage_1_winner,
        stage_2_winner,
        most_laps_led,
        laps_led,
        api_driver_name,
        api_car_number
      `)
      .eq('driver_id', driverRecord.id);

    if (resultsByDriverId) {
      // Merge, avoiding duplicates by id
      const existingIds = new Set(allResults.map(r => r.id));
      for (const result of resultsByDriverId) {
        if (!existingIds.has(result.id)) {
          allResults.push(result);
        }
      }
    }
  }

  if (allResults.length === 0) {
    notFound();
  }

  // Get race details for all results
  const raceIds = [...new Set(allResults.map(r => r.race_id))];
  const { data: races } = await supabase
    .from('races')
    .select('id, name, track, scheduled_datetime, race_number, season_id, status')
    .in('id', raceIds);

  // Get seasons for year lookup
  const seasonIds = [...new Set(races?.map(r => r.season_id) || [])];
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id, year')
    .in('id', seasonIds);

  const seasonYearMap = new Map(seasons?.map(s => [s.id, s.year]) || []);
  const raceMap = new Map(races?.map(r => [r.id, {
    ...r,
    year: seasonYearMap.get(r.season_id) || 0
  }]) || []);

  // Calculate driver's tier based on weighted fantasy points among all drivers
  // Step 1: Get the 90 most recent final races for tier calculation
  const { data: recentRaces } = await supabase
    .from('races')
    .select('id, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  const recentRaceIds = recentRaces?.map(r => r.id) || [];
  const raceIndexMap = new Map<string, number>();
  recentRaces?.forEach((race, index) => {
    raceIndexMap.set(race.id, index);
  });

  // Step 2: Get all race results for recent races to calculate all drivers' weighted points
  let allRecentResults: any[] = [];
  let tierPage = 0;
  const tierPageSize = 1000;

  while (true) {
    const { data: pageResults } = await supabase
      .from('race_results')
      .select('race_id, finish_position, stage_1_winner, stage_2_winner, most_laps_led, api_driver_name')
      .in('race_id', recentRaceIds)
      .range(tierPage * tierPageSize, (tierPage + 1) * tierPageSize - 1);

    if (!pageResults || pageResults.length === 0) break;
    allRecentResults = allRecentResults.concat(pageResults);
    if (pageResults.length < tierPageSize) break;
    tierPage++;
  }

  // Step 3: Calculate weighted fantasy points and recent race counts per driver
  // Full-time drivers must have at least 15 races in the most recent 30 to be tier-eligible
  const MIN_RECENT_RACES_FOR_TIER = 15;
  const mostRecent30RaceIds = new Set(recentRaceIds.slice(0, 30));

  const driverWeightedPoints: Record<string, number> = {};
  const driverRecentRaces: Record<string, number> = {};

  for (const result of allRecentResults) {
    const driverName = result.api_driver_name;
    if (!driverName) continue;

    const raceIndex = raceIndexMap.get(result.race_id) ?? 90;
    const weight = getWeightForRaceIndex(raceIndex);
    const racePoints = calculateFantasyPoints(
      result.finish_position || 0,
      result.stage_1_winner || false,
      result.stage_2_winner || false,
      result.most_laps_led || false
    );

    driverWeightedPoints[driverName] = (driverWeightedPoints[driverName] || 0) + (racePoints * weight);

    // Count races in the most recent 30
    if (mostRecent30RaceIds.has(result.race_id)) {
      driverRecentRaces[driverName] = (driverRecentRaces[driverName] || 0) + 1;
    }
  }

  // Step 4: Sort full-time drivers by weighted points and assign tiers
  // Only drivers with 15+ races in the most recent 30 are tier-eligible
  const fullTimeDrivers = Object.entries(driverWeightedPoints)
    .filter(([name]) => (driverRecentRaces[name] || 0) >= MIN_RECENT_RACES_FOR_TIER)
    .sort(([, a], [, b]) => b - a);

  // Check if current driver is full-time
  const currentDriverRecentRaces = driverRecentRaces[decodedName] || 0;
  const isFullTime = currentDriverRecentRaces >= MIN_RECENT_RACES_FOR_TIER;

  let driverTier = 0; // 0 = part-time/ineligible
  if (isFullTime) {
    const driverIndex = fullTimeDrivers.findIndex(([name]) => name.toLowerCase() === decodedName.toLowerCase());
    if (driverIndex !== -1) {
      driverTier = Math.floor(driverIndex / 6) + 1;
    }
  }

  // Build results with race info, sorted by date descending
  const resultsWithRaces = allResults
    .map(result => {
      const race = raceMap.get(result.race_id);
      return {
        ...result,
        race_name: race?.name || 'Unknown Race',
        track: race?.track || '',
        race_date: race?.scheduled_datetime || '',
        year: race?.year || 0,
        race_number: race?.race_number || 0,
        race_status: race?.status || '',
      };
    })
    .filter(r => r.race_status === 'final')
    .sort((a, b) => new Date(b.race_date).getTime() - new Date(a.race_date).getTime());

  // Calculate stats
  const stats = {
    races: resultsWithRaces.length,
    wins: resultsWithRaces.filter(r => r.finish_position === 1).length,
    stage_wins: resultsWithRaces.reduce((sum, r) =>
      sum + (r.stage_1_winner ? 1 : 0) + (r.stage_2_winner ? 1 : 0), 0),
    laps_led_races: resultsWithRaces.filter(r => r.most_laps_led).length,
    top_5s: resultsWithRaces.filter(r => r.finish_position <= 5).length,
    top_10s: resultsWithRaces.filter(r => r.finish_position <= 10).length,
    avg_finish: resultsWithRaces.length > 0
      ? Math.round((resultsWithRaces.reduce((sum, r) => sum + r.finish_position, 0) / resultsWithRaces.length) * 10) / 10
      : 0,
    best_finish: resultsWithRaces.length > 0
      ? Math.min(...resultsWithRaces.map(r => r.finish_position))
      : 0,
    worst_finish: resultsWithRaces.length > 0
      ? Math.max(...resultsWithRaces.map(r => r.finish_position))
      : 0,
  };

  // Get unique car numbers used
  const carNumbers = [...new Set(resultsWithRaces.map(r => r.api_car_number).filter(Boolean))].sort((a, b) => a - b);

  // Group results by year
  const resultsByYear: Record<number, typeof resultsWithRaces> = {};
  for (const result of resultsWithRaces) {
    if (!resultsByYear[result.year]) {
      resultsByYear[result.year] = [];
    }
    resultsByYear[result.year].push(result);
  }

  const years = Object.keys(resultsByYear).map(Number).sort((a, b) => b - a);

  const driverName = driverRecord?.name || decodedName;
  const teamName = driverRecord?.team_name;
  const currentCarNumber = driverRecord?.car_number || carNumbers[carNumbers.length - 1] || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl font-bold text-amber-400">#{currentCarNumber}</span>
            <h1 className="text-3xl font-bold text-white">{driverName}</h1>
            {driverTier > 0 ? (
              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${getTierColor(driverTier)}`}>
                T{driverTier}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center px-3 h-10 rounded-full text-sm font-bold bg-gray-700 text-gray-400">
                Part-time
              </span>
            )}
          </div>
          {teamName && (
            <p className="text-purple-400">{teamName}</p>
          )}
          {carNumbers.length > 1 && (
            <p className="text-purple-500 text-sm mt-1">
              Car numbers used: {carNumbers.map(n => `#${n}`).join(', ')}
            </p>
          )}
        </div>
        <Link
          href="/driver-rankings"
          className="text-purple-400 hover:text-purple-300 text-sm"
        >
          ← Back to Rankings
        </Link>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
        <div className="glass rounded-xl p-4 flex flex-col items-center justify-center">
          {driverTier > 0 ? (
            <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold ${getTierColor(driverTier)}`}>
              {driverTier}
            </span>
          ) : (
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold bg-gray-700 text-gray-400">
              -
            </span>
          )}
          <div className="text-purple-400 text-sm mt-2">Tier</div>
        </div>
        <StatCard label="Races" value={stats.races} />
        <StatCard label="Wins" value={stats.wins} color="amber" />
        <StatCard label="Stage Wins" value={stats.stage_wins} color="emerald" />
        <StatCard label="Laps Led" value={stats.laps_led_races} color="cyan" />
        <StatCard label="Avg Finish" value={stats.avg_finish.toFixed(1)} />
        <StatCard label="Top 5s" value={stats.top_5s} />
        <StatCard label="Top 10s" value={stats.top_10s} />
        <StatCard label="Best Finish" value={stats.best_finish} color="emerald" />
        <StatCard label="Worst Finish" value={stats.worst_finish} color="purple" />
      </div>

      {/* Results by Year */}
      {years.map(year => {
        const yearResults = resultsByYear[year];
        const yearStats = {
          races: yearResults.length,
          wins: yearResults.filter(r => r.finish_position === 1).length,
          avg: yearResults.length > 0
            ? (yearResults.reduce((sum, r) => sum + r.finish_position, 0) / yearResults.length).toFixed(1)
            : '0',
        };

        return (
          <div key={year} className="glass rounded-xl overflow-hidden">
            <div className="bg-purple-900/30 px-4 py-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">{year} Season</h2>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-purple-300">{yearStats.races} races</span>
                {yearStats.wins > 0 && (
                  <span className="text-amber-400 font-semibold">{yearStats.wins} wins</span>
                )}
                <span className="text-purple-400">Avg: {yearStats.avg}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-purple-400 text-sm border-b border-purple-800/30">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">Race</th>
                    <th className="px-4 py-2 text-center">Finish</th>
                    <th className="px-4 py-2 text-center">Stage 1</th>
                    <th className="px-4 py-2 text-center">Stage 2</th>
                    <th className="px-4 py-2 text-center">Laps Led</th>
                    <th className="px-4 py-2 text-center">Car</th>
                  </tr>
                </thead>
                <tbody>
                  {yearResults.map((result, idx) => {
                    const isWin = result.finish_position === 1;
                    const isTop5 = result.finish_position <= 5;
                    const isTop10 = result.finish_position <= 10;

                    return (
                      <tr
                        key={result.id}
                        className={`border-b border-purple-800/20 hover:bg-purple-800/20 ${
                          isWin ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-purple-500 text-sm">
                          {result.race_number}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/races/${result.race_id}`}
                            className="text-white hover:text-amber-400 transition-colors"
                          >
                            {result.race_name}
                          </Link>
                          <div className="text-purple-500 text-xs">
                            {new Date(result.race_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`font-bold text-lg ${
                            isWin ? 'text-amber-400' :
                            isTop5 ? 'text-emerald-400' :
                            isTop10 ? 'text-cyan-400' :
                            'text-purple-300'
                          }`}>
                            {result.finish_position}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {result.stage_1_winner ? (
                            <span className="text-emerald-400 font-semibold">✓</span>
                          ) : (
                            <span className="text-purple-700">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {result.stage_2_winner ? (
                            <span className="text-emerald-400 font-semibold">✓</span>
                          ) : (
                            <span className="text-purple-700">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {result.most_laps_led ? (
                            <span className="text-cyan-400 font-semibold">✓</span>
                          ) : (
                            <span className="text-purple-700">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center text-purple-400 text-sm">
                          #{result.api_car_number || currentCarNumber}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, color = 'white' }: { label: string; value: string | number; color?: string }) {
  const colorClasses: Record<string, string> = {
    white: 'text-white',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      <div className="text-purple-400 text-sm">{label}</div>
    </div>
  );
}
