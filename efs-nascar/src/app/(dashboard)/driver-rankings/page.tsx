import { createClient } from '@/lib/supabase/server';
import { POSITION_POINTS } from '@/types';

// Weights for recency tiers (most recent 30, middle 30, oldest 30)
const TIER_WEIGHTS = {
  recent: 3,   // Races 1-30 (most recent)
  middle: 2,   // Races 31-60
  oldest: 1,   // Races 61-90
};

interface DriverRanking {
  driver_id: string;
  driver_name: string;
  car_number: number;
  team_name: string | null;
  is_active: boolean;
  total_points: number;
  weighted_score: number;
  weighted_per_race: number;
  position_points: number;
  stage_wins: number;
  stage_points: number;
  laps_led_bonuses: number;
  races_counted: number;
  avg_finish: number;
  wins: number;
  top_5s: number;
  top_10s: number;
}

export default async function DriverRankingsPage() {
  const supabase = await createClient();

  // Get the last 90 races that have results (status = 'final')
  const { data: races } = await supabase
    .from('races')
    .select('id, scheduled_datetime')
    .eq('status', 'final')
    .order('scheduled_datetime', { ascending: false })
    .limit(90);

  let rankings: DriverRanking[] = [];
  let racesAnalyzed = 0;

  if (races && races.length > 0) {
    racesAnalyzed = races.length;

    // Create a map of race_id to tier weight based on recency
    const raceWeights: Record<string, number> = {};
    races.forEach((race, index) => {
      if (index < 30) {
        raceWeights[race.id] = TIER_WEIGHTS.recent;
      } else if (index < 60) {
        raceWeights[race.id] = TIER_WEIGHTS.middle;
      } else {
        raceWeights[race.id] = TIER_WEIGHTS.oldest;
      }
    });

    const raceIds = races.map(r => r.id);

    // Get all results for these races
    const { data: results } = await supabase
      .from('race_results')
      .select(`
        *,
        driver:drivers(id, name, car_number, team_name, is_active)
      `)
      .in('race_id', raceIds);

    // Aggregate driver stats
    const driverStats: Record<string, {
      driver_id: string;
      driver_name: string;
      car_number: number;
      team_name: string | null;
      is_active: boolean;
      total_position_points: number;
      weighted_position_points: number;
      stage_wins: number;
      weighted_stage_points: number;
      laps_led_bonuses: number;
      weighted_laps_led: number;
      races_counted: number;
      total_finish_position: number;
      wins: number;
      top_5s: number;
      top_10s: number;
    }> = {};

    for (const result of results || []) {
      const driver = result.driver;
      if (!driver) continue;

      const weight = raceWeights[result.race_id] || 1;

      if (!driverStats[driver.id]) {
        driverStats[driver.id] = {
          driver_id: driver.id,
          driver_name: driver.name,
          car_number: driver.car_number,
          team_name: driver.team_name,
          is_active: driver.is_active,
          total_position_points: 0,
          weighted_position_points: 0,
          stage_wins: 0,
          weighted_stage_points: 0,
          laps_led_bonuses: 0,
          weighted_laps_led: 0,
          races_counted: 0,
          total_finish_position: 0,
          wins: 0,
          top_5s: 0,
          top_10s: 0,
        };
      }

      const stats = driverStats[driver.id];

      // Position points
      const posPoints = POSITION_POINTS[result.finish_position] || 0;
      stats.total_position_points += posPoints;
      stats.weighted_position_points += posPoints * weight;

      // Stage wins
      if (result.stage_1_winner) {
        stats.stage_wins += 1;
        stats.weighted_stage_points += 1 * weight;
      }
      if (result.stage_2_winner) {
        stats.stage_wins += 1;
        stats.weighted_stage_points += 1 * weight;
      }

      // Most laps led bonus
      if (result.most_laps_led) {
        stats.laps_led_bonuses += 1;
        stats.weighted_laps_led += 1 * weight;
      }

      // Race count and finish position for average
      stats.races_counted += 1;
      stats.total_finish_position += result.finish_position;

      // Wins, top 5s, top 10s
      if (result.finish_position === 1) stats.wins += 1;
      if (result.finish_position <= 5) stats.top_5s += 1;
      if (result.finish_position <= 10) stats.top_10s += 1;
    }

    // Convert to rankings array with calculated totals
    rankings = Object.values(driverStats).map(stats => {
      const totalPoints = stats.total_position_points + stats.stage_wins + stats.laps_led_bonuses;
      const weightedScore = stats.weighted_position_points + stats.weighted_stage_points + stats.weighted_laps_led;
      const weightedPerRace = stats.races_counted > 0
        ? Math.round((weightedScore / stats.races_counted) * 100) / 100
        : 0;

      return {
        driver_id: stats.driver_id,
        driver_name: stats.driver_name,
        car_number: stats.car_number,
        team_name: stats.team_name,
        is_active: stats.is_active,
        position_points: stats.total_position_points,
        stage_wins: stats.stage_wins,
        stage_points: stats.stage_wins,
        laps_led_bonuses: stats.laps_led_bonuses,
        total_points: totalPoints,
        weighted_score: weightedScore,
        weighted_per_race: weightedPerRace,
        races_counted: stats.races_counted,
        avg_finish: stats.races_counted > 0
          ? Math.round((stats.total_finish_position / stats.races_counted) * 10) / 10
          : 0,
        wins: stats.wins,
        top_5s: stats.top_5s,
        top_10s: stats.top_10s,
      };
    });

    // Sort by total points descending
    rankings.sort((a, b) => b.total_points - a.total_points);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Driver Rankings</h1>
          <p className="text-purple-400 mt-1">
            Fantasy points over the last {racesAnalyzed} races
          </p>
        </div>
      </div>

      {/* Scoring Legend */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Fantasy Scoring</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <h3 className="text-amber-400 font-semibold mb-2">Position Points</h3>
            <div className="text-purple-300 space-y-1">
              <p>1st: 10 | 2nd: 9 | 3rd: 8 | 4th: 7 | 5th: 6</p>
              <p>6th: 5 | 7th: 4 | 8th: 3 | 9th: 2 | 10th: 1</p>
              <p className="text-purple-500">11th+: 0 pts</p>
            </div>
          </div>
          <div>
            <h3 className="text-amber-400 font-semibold mb-2">Bonuses</h3>
            <div className="text-purple-300 space-y-1">
              <p>Stage Win: +1 pt (up to 2/race)</p>
              <p>Most Laps Led: +1 pt</p>
            </div>
          </div>
          <div>
            <h3 className="text-emerald-400 font-semibold mb-2">Weighted Score</h3>
            <div className="text-purple-300 space-y-1">
              <p>Recent 30 races: <span className="text-emerald-400">3x</span></p>
              <p>Middle 30 races: <span className="text-amber-400">2x</span></p>
              <p>Oldest 30 races: <span className="text-purple-400">1x</span></p>
            </div>
          </div>
          <div>
            <h3 className="text-cyan-400 font-semibold mb-2">Per-Race Score</h3>
            <div className="text-purple-300 space-y-1">
              <p>Weighted Score / Races Run</p>
              <p className="text-purple-500">Identifies efficient performers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rankings Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">Driver</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3 text-right">
                  <span className="text-emerald-400">Weighted</span>
                </th>
                <th className="px-3 py-3 text-right">
                  <span className="text-cyan-400">Per Race</span>
                </th>
                <th className="px-3 py-3 text-right">Pos Pts</th>
                <th className="px-3 py-3 text-right">Stages</th>
                <th className="px-3 py-3 text-right">Laps</th>
                <th className="px-3 py-3 text-right">Races</th>
                <th className="px-3 py-3 text-right">Avg</th>
                <th className="px-3 py-3 text-right">W</th>
                <th className="px-3 py-3 text-right">T5</th>
                <th className="px-3 py-3 text-right">T10</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((driver, index) => {
                const rank = index + 1;

                // Highlight top performers
                let rankColor = 'text-purple-400';
                let rowHighlight = '';

                if (rank === 1) {
                  rankColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300';
                  rowHighlight = 'bg-amber-500/10';
                } else if (rank <= 3) {
                  rankColor = 'text-amber-400';
                } else if (rank <= 10) {
                  rankColor = 'text-emerald-400';
                }

                return (
                  <tr
                    key={driver.driver_id}
                    className={`border-b border-purple-800/30 hover:bg-purple-800/20 transition-colors ${rowHighlight}`}
                  >
                    <td className="px-3 py-3">
                      <span className={`font-bold text-lg ${rankColor}`}>{rank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-amber-400 font-bold">#{driver.car_number}</span>
                        <span className="text-white font-medium">{driver.driver_name}</span>
                        {!driver.is_active && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                            X
                          </span>
                        )}
                      </div>
                      <div className="text-purple-500 text-xs mt-0.5">{driver.team_name || '-'}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-white font-bold text-lg">{driver.total_points}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-emerald-400 font-bold text-lg">{driver.weighted_score}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-cyan-400 font-semibold">{driver.weighted_per_race.toFixed(2)}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-purple-200">
                      {driver.position_points}
                    </td>
                    <td className="px-3 py-3 text-right text-purple-200">
                      {driver.stage_wins}
                    </td>
                    <td className="px-3 py-3 text-right text-purple-200">
                      {driver.laps_led_bonuses}
                    </td>
                    <td className="px-3 py-3 text-right text-purple-200">
                      {driver.races_counted}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={`${
                        driver.avg_finish <= 10
                          ? 'text-emerald-400'
                          : driver.avg_finish <= 15
                          ? 'text-amber-400'
                          : 'text-purple-300'
                      }`}>
                        {driver.avg_finish.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {driver.wins > 0 ? (
                        <span className="text-amber-400 font-bold">{driver.wins}</span>
                      ) : (
                        <span className="text-purple-500">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-purple-200">{driver.top_5s}</td>
                    <td className="px-3 py-3 text-right text-purple-200">{driver.top_10s}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rankings.length === 0 && (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-purple-300">No driver rankings available yet.</p>
          <p className="text-purple-500 text-sm mt-2">
            Rankings will appear after race results are entered.
          </p>
        </div>
      )}

      {/* Points Breakdown Info */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-3">Understanding the Scores</h2>
        <div className="text-purple-300 text-sm space-y-3">
          <div>
            <span className="text-white font-semibold">Total Points:</span> Raw fantasy points (position + stage wins + laps led bonuses) - good for seeing overall production.
          </div>
          <div>
            <span className="text-emerald-400 font-semibold">Weighted Score:</span> Points weighted by recency. Recent races (last 30) count 3x, middle 30 count 2x, oldest 30 count 1x. Highlights drivers performing well <em>now</em>.
          </div>
          <div>
            <span className="text-cyan-400 font-semibold">Per-Race Score:</span> Weighted score divided by races run. Identifies efficient performers and normalizes for drivers who missed races.
          </div>
          <div className="pt-2 border-t border-purple-800/30">
            <span className="text-amber-400 font-semibold">Avg Finish</span> color-coded:
            <span className="text-emerald-400 ml-2">Green = Top 10</span>,
            <span className="text-amber-400 ml-2">Yellow = 11-15</span>,
            <span className="text-purple-300 ml-2">Purple = 16+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
