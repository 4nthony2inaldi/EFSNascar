import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Race, RaceResult, Driver, Pick, Team, RaceScore } from '@/types';
import { POSITION_POINTS } from '@/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RaceResultsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user's team
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user?.id)
    .single();
  const userTeamId = membership?.team_id;

  // Get race details
  const { data: race, error } = await supabase
    .from('races')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !race) {
    notFound();
  }

  // Get race results with drivers
  const { data: results } = await supabase
    .from('race_results')
    .select('*, driver:drivers(*)')
    .eq('race_id', id)
    .order('finish_position', { ascending: true });

  // Get all picks for this race with team info
  const { data: picks } = await supabase
    .from('picks')
    .select('*, team:teams(*)')
    .eq('race_id', id);

  // Get race scores
  const { data: scores } = await supabase
    .from('race_scores')
    .select('*, team:teams(*)')
    .eq('race_id', id)
    .order('total_points', { ascending: false });

  // Build results map for quick lookup
  const resultsMap: Record<string, RaceResult & { driver: Driver }> = {};
  results?.forEach((r: any) => {
    resultsMap[r.driver_id] = r;
  });

  // Count how many teams picked each driver
  const driverPickCounts: Record<string, number> = {};
  picks?.forEach((pick: any) => {
    [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].forEach((driverId) => {
      driverPickCounts[driverId] = (driverPickCounts[driverId] || 0) + 1;
    });
  });

  const getOverlapColor = (count: number) => {
    const totalTeams = picks?.length || 1;
    const percentage = (count / totalTeams) * 100;

    if (percentage >= 80) return 'bg-red-500/30 text-red-300';
    if (percentage >= 60) return 'bg-orange-500/30 text-orange-300';
    if (percentage >= 40) return 'bg-yellow-500/30 text-yellow-300';
    if (percentage >= 20) return 'bg-blue-500/30 text-blue-300';
    return 'bg-green-500/30 text-green-300';
  };

  const formatPoints = (position: number) => {
    return POSITION_POINTS[position] || 0;
  };

  // Find stage winners and most laps led
  const stage1Winner = results?.find((r: any) => r.stage_1_winner);
  const stage2Winner = results?.find((r: any) => r.stage_2_winner);
  const mostLapsLed = results?.find((r: any) => r.most_laps_led);

  // Check if deadline has passed for showing picks link
  const deadlinePassed = new Date() > new Date(race.deadline_datetime);

  return (
    <div className="space-y-8">
      {/* Race Header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Race #{race.race_number}</p>
            <h1 className="text-3xl font-bold text-white">{race.name}</h1>
            <p className="text-gray-400">{race.track}</p>
            <p className="text-sm text-gray-500 mt-2">
              {new Date(race.scheduled_datetime).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              race.status === 'final' ? 'bg-green-500/20 text-green-500' :
              race.status === 'in_progress' ? 'bg-red-500/20 text-red-500' :
              'bg-gray-600 text-gray-300'
            }`}>
              {race.status.charAt(0).toUpperCase() + race.status.slice(1)}
            </span>
            {deadlinePassed && (
              <Link
                href={`/races/${id}/picks`}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                View All Picks
              </Link>
            )}
          </div>
        </div>

        {/* Race Highlights */}
        {race.status === 'final' && results && results.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Winner</div>
              <div className="text-yellow-500 font-bold">
                #{results[0].driver?.car_number} {results[0].driver?.name}
              </div>
            </div>
            {stage1Winner && (
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Stage 1 Winner</div>
                <div className="text-white font-medium">
                  #{stage1Winner.driver?.car_number} {stage1Winner.driver?.name}
                </div>
              </div>
            )}
            {stage2Winner && (
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Stage 2 Winner</div>
                <div className="text-white font-medium">
                  #{stage2Winner.driver?.car_number} {stage2Winner.driver?.name}
                </div>
              </div>
            )}
            {mostLapsLed && (
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Most Laps Led</div>
                <div className="text-white font-medium">
                  #{mostLapsLed.driver?.car_number} {mostLapsLed.driver?.name}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Team Scores */}
      {scores && scores.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Team Scores</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 pr-4 text-center">Driver 1</th>
                  <th className="pb-3 pr-4 text-center">Driver 2</th>
                  <th className="pb-3 pr-4 text-center">Driver 3</th>
                  <th className="pb-3 pr-4 text-center">Bonus</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((score: any, index: number) => {
                  const pick = picks?.find((p: any) => p.team_id === score.team_id);
                  const isUserTeam = score.team_id === userTeamId;

                  return (
                    <tr
                      key={score.id}
                      className={`border-b border-gray-700/50 ${isUserTeam ? 'bg-yellow-500/10' : ''}`}
                    >
                      <td className="py-3 pr-4 text-gray-400">{index + 1}</td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/teams/${score.team_id}`}
                          className="flex items-center space-x-2 hover:text-yellow-500"
                        >
                          <span className="text-yellow-500 font-bold">
                            #{score.team?.car_number}
                          </span>
                          <span className="text-white">{score.team?.name}</span>
                          {isUserTeam && (
                            <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">
                              YOU
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-center text-white">
                        {score.driver_1_points}
                      </td>
                      <td className="py-3 pr-4 text-center text-white">
                        {score.driver_2_points}
                      </td>
                      <td className="py-3 pr-4 text-center text-white">
                        {score.driver_3_points}
                      </td>
                      <td className="py-3 pr-4 text-center text-yellow-500">
                        +{score.stage_bonus + score.laps_led_bonus + score.top_10_bonus}
                      </td>
                      <td className="py-3 text-right text-white font-bold text-lg">
                        {score.total_points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Teams' Picks */}
      {picks && picks.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Team Picks</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 pr-4">Driver 1</th>
                  <th className="pb-3 pr-4">Driver 2</th>
                  <th className="pb-3 pr-4">Driver 3</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((pick: any) => {
                  const isUserTeam = pick.team_id === userTeamId;

                  const renderDriver = (driverId: string) => {
                    const result = resultsMap[driverId];
                    const pickCount = driverPickCounts[driverId] || 0;

                    if (!result) return <span className="text-gray-500">Unknown</span>;

                    return (
                      <div className={`inline-flex items-center space-x-2 px-2 py-1 rounded ${getOverlapColor(pickCount)}`}>
                        <span className="font-bold">#{result.driver?.car_number}</span>
                        <span>{result.driver?.name}</span>
                        <span className="text-xs opacity-75">
                          P{result.finish_position} ({formatPoints(result.finish_position)}pts)
                        </span>
                      </div>
                    );
                  };

                  return (
                    <tr
                      key={pick.id}
                      className={`border-b border-gray-700/50 ${isUserTeam ? 'bg-yellow-500/10' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/teams/${pick.team_id}`}
                          className="flex items-center space-x-2 hover:text-yellow-500"
                        >
                          <span className="text-yellow-500 font-bold">
                            #{pick.team?.car_number}
                          </span>
                          <span className="text-white">{pick.team?.name}</span>
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{renderDriver(pick.driver_1_id)}</td>
                      <td className="py-3 pr-4">{renderDriver(pick.driver_2_id)}</td>
                      <td className="py-3 pr-4">{renderDriver(pick.driver_3_id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <span className="text-gray-400">Pick Overlap:</span>
            <span className="px-2 py-1 rounded bg-green-500/30 text-green-300">Unique</span>
            <span className="px-2 py-1 rounded bg-blue-500/30 text-blue-300">Low</span>
            <span className="px-2 py-1 rounded bg-yellow-500/30 text-yellow-300">Medium</span>
            <span className="px-2 py-1 rounded bg-orange-500/30 text-orange-300">High</span>
            <span className="px-2 py-1 rounded bg-red-500/30 text-red-300">Very High</span>
          </div>
        </div>
      )}

      {/* Race Results */}
      {results && results.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Full Race Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">Pos</th>
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Driver</th>
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 text-center">Points</th>
                  <th className="pb-3 text-center">Picked By</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result: any) => {
                  const pickCount = driverPickCounts[result.driver_id] || 0;

                  return (
                    <tr key={result.id} className="border-b border-gray-700/50">
                      <td className="py-3 pr-4">
                        <span className={`font-bold ${
                          result.finish_position === 1 ? 'text-yellow-500' :
                          result.finish_position <= 3 ? 'text-gray-300' :
                          result.finish_position <= 10 ? 'text-green-500' : 'text-gray-500'
                        }`}>
                          {result.finish_position}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-yellow-500 font-bold">
                        {result.driver?.car_number}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-white">{result.driver?.name}</span>
                          {result.stage_1_winner && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">S1</span>
                          )}
                          {result.stage_2_winner && (
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">S2</span>
                          )}
                          {result.most_laps_led && (
                            <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">ML</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{result.driver?.team_name}</td>
                      <td className="py-3 text-center text-white font-medium">
                        {formatPoints(result.finish_position)}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-1 rounded text-sm ${getOverlapColor(pickCount)}`}>
                          {pickCount} team{pickCount !== 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {race.status !== 'final' && (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-400">Results will be available after the race is finalized.</p>
        </div>
      )}
    </div>
  );
}
