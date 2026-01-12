import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface DriverStats {
  driver_name: string;
  car_numbers: number[];
  current_car_number: number;
  team_name: string | null;
  races: number;
  wins: number;
  stage_wins: number;
  laps_led_races: number;
  avg_finish: number;
  top_5s: number;
  top_10s: number;
}

export default async function DriverRankingsPage() {
  const supabase = await createClient();

  // Step 1: Get the 90 most recent races with status = 'final'
  const { data: races, error: racesError } = await supabase
    .from('races')
    .select('id, name, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  if (racesError) {
    console.error('Error fetching races:', racesError);
    return <ErrorDisplay message="Failed to load races" />;
  }

  if (!races || races.length === 0) {
    return <EmptyState />;
  }

  const raceIds = races.map(r => r.id);
  const racesAnalyzed = races.length;

  // Step 2: Get ALL race results for these races (paginate to avoid limits)
  let allResults: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pageResults, error: resultsError } = await supabase
      .from('race_results')
      .select(`
        id,
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

    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      break;
    }

    if (!pageResults || pageResults.length === 0) {
      break;
    }

    allResults = allResults.concat(pageResults);

    if (pageResults.length < pageSize) {
      break;
    }

    page++;
  }

  // Step 3: Get all drivers for name/team lookup
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name');

  const driverMap = new Map<string, { name: string; car_number: number; team_name: string | null }>();
  for (const driver of drivers || []) {
    driverMap.set(driver.id, {
      name: driver.name,
      car_number: driver.car_number,
      team_name: driver.team_name,
    });
  }

  // Step 4: Aggregate stats BY DRIVER NAME (not by driver_id)
  // This consolidates stats for drivers who changed car numbers
  const statsByName: Record<string, {
    driver_name: string;
    car_numbers: Set<number>;
    current_car_number: number;
    team_name: string | null;
    total_finish: number;
    races: number;
    wins: number;
    stage_wins: number;
    laps_led_races: number;
    top_5s: number;
    top_10s: number;
  }> = {};

  for (const result of allResults) {
    // Get driver name - prefer api_driver_name, fall back to driver lookup
    let driverName = result.api_driver_name;
    let carNumber = result.api_car_number;
    let teamName: string | null = null;

    if (!driverName && result.driver_id) {
      const driver = driverMap.get(result.driver_id);
      if (driver) {
        driverName = driver.name;
        carNumber = carNumber || driver.car_number;
        teamName = driver.team_name;
      }
    }

    if (!driverName) continue;

    // Initialize stats for this driver name if needed
    if (!statsByName[driverName]) {
      const driver = driverMap.get(result.driver_id);
      statsByName[driverName] = {
        driver_name: driverName,
        car_numbers: new Set(),
        current_car_number: driver?.car_number || carNumber || 0,
        team_name: driver?.team_name || teamName,
        total_finish: 0,
        races: 0,
        wins: 0,
        stage_wins: 0,
        laps_led_races: 0,
        top_5s: 0,
        top_10s: 0,
      };
    }

    const stats = statsByName[driverName];

    // Track car numbers used
    if (carNumber) {
      stats.car_numbers.add(carNumber);
    }

    // Count stats
    stats.races += 1;
    stats.total_finish += result.finish_position || 0;

    if (result.finish_position === 1) stats.wins += 1;
    if (result.finish_position <= 5) stats.top_5s += 1;
    if (result.finish_position <= 10) stats.top_10s += 1;

    if (result.stage_1_winner) stats.stage_wins += 1;
    if (result.stage_2_winner) stats.stage_wins += 1;

    if (result.most_laps_led) stats.laps_led_races += 1;
  }

  // Step 5: Convert to array and calculate averages
  const rankings: DriverStats[] = Object.values(statsByName)
    .map(stats => ({
      driver_name: stats.driver_name,
      car_numbers: Array.from(stats.car_numbers).sort((a, b) => a - b),
      current_car_number: stats.current_car_number,
      team_name: stats.team_name,
      races: stats.races,
      wins: stats.wins,
      stage_wins: stats.stage_wins,
      laps_led_races: stats.laps_led_races,
      avg_finish: stats.races > 0 ? Math.round((stats.total_finish / stats.races) * 10) / 10 : 0,
      top_5s: stats.top_5s,
      top_10s: stats.top_10s,
    }))
    .filter(d => d.races > 0)
    .sort((a, b) => {
      // Sort by wins desc, then by avg finish asc
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.avg_finish - b.avg_finish;
    });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
        <p className="text-purple-400 mt-1">
          Statistics from the last {racesAnalyzed} races
        </p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-400">{racesAnalyzed}</div>
          <div className="text-purple-300 text-sm">Races Analyzed</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-3xl font-bold text-emerald-400">{rankings.length}</div>
          <div className="text-purple-300 text-sm">Drivers</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-3xl font-bold text-cyan-400">{allResults.length}</div>
          <div className="text-purple-300 text-sm">Total Results</div>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-3xl font-bold text-purple-400">
            {rankings.filter(d => d.wins > 0).length}
          </div>
          <div className="text-purple-300 text-sm">Race Winners</div>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3 text-center">Races</th>
                <th className="px-4 py-3 text-center">
                  <span className="text-amber-400">Wins</span>
                </th>
                <th className="px-4 py-3 text-center">
                  <span className="text-emerald-400">Stage Wins</span>
                </th>
                <th className="px-4 py-3 text-center">
                  <span className="text-cyan-400">Laps Led</span>
                </th>
                <th className="px-4 py-3 text-center">Avg Finish</th>
                <th className="px-4 py-3 text-center">Top 5</th>
                <th className="px-4 py-3 text-center">Top 10</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((driver, index) => {
                const rank = index + 1;

                // Highlight styling based on rank
                let rankClass = 'text-purple-400';
                let rowClass = '';

                if (rank === 1) {
                  rankClass = 'text-amber-400 font-bold';
                  rowClass = 'bg-amber-500/10';
                } else if (rank <= 3) {
                  rankClass = 'text-amber-400';
                } else if (rank <= 10) {
                  rankClass = 'text-emerald-400';
                }

                // Show multiple car numbers if driver used more than one
                const carDisplay = driver.car_numbers.length > 1
                  ? driver.car_numbers.map(n => `#${n}`).join(', ')
                  : `#${driver.current_car_number}`;

                return (
                  <tr
                    key={driver.driver_name}
                    className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${rowClass}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`text-lg ${rankClass}`}>{rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-mono text-sm">{carDisplay}</span>
                          <Link
                            href={`/drivers/${encodeURIComponent(driver.driver_name)}`}
                            className="text-white font-medium hover:text-amber-400 transition-colors"
                          >
                            {driver.driver_name}
                          </Link>
                        </div>
                        {driver.team_name && (
                          <span className="text-purple-500 text-xs">{driver.team_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-purple-200">
                      {driver.races}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {driver.wins > 0 ? (
                        <span className="text-amber-400 font-bold text-lg">{driver.wins}</span>
                      ) : (
                        <span className="text-purple-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {driver.stage_wins > 0 ? (
                        <span className="text-emerald-400 font-semibold">{driver.stage_wins}</span>
                      ) : (
                        <span className="text-purple-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {driver.laps_led_races > 0 ? (
                        <span className="text-cyan-400 font-semibold">{driver.laps_led_races}</span>
                      ) : (
                        <span className="text-purple-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${
                        driver.avg_finish <= 10 ? 'text-emerald-400' :
                        driver.avg_finish <= 15 ? 'text-amber-400' :
                        driver.avg_finish <= 20 ? 'text-purple-300' :
                        'text-purple-500'
                      }`}>
                        {driver.avg_finish.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-purple-200">
                      {driver.top_5s}
                    </td>
                    <td className="px-4 py-3 text-center text-purple-200">
                      {driver.top_10s}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Column Definitions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-purple-300">
          <div>
            <span className="text-amber-400 font-semibold">Wins:</span> Race victories (P1 finishes)
          </div>
          <div>
            <span className="text-emerald-400 font-semibold">Stage Wins:</span> Stage 1 + Stage 2 wins
          </div>
          <div>
            <span className="text-cyan-400 font-semibold">Laps Led:</span> Races leading most laps
          </div>
          <div>
            <span className="text-white font-semibold">Avg Finish:</span> Average finishing position
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-purple-800/30 text-sm text-purple-400">
          Sorted by wins (descending), then by average finish (ascending).
          Stats consolidated by driver name across car number changes.
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
        <p className="text-purple-400 mt-1">Statistics from recent races</p>
      </div>
      <div className="glass rounded-xl p-12 text-center">
        <p className="text-purple-300">No race results available yet.</p>
        <p className="text-purple-500 text-sm mt-2">
          Import race results to see driver rankings.
        </p>
      </div>
    </div>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
      </div>
      <div className="glass rounded-xl p-12 text-center border border-red-500/30">
        <p className="text-red-400">{message}</p>
      </div>
    </div>
  );
}
