import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Race, RaceResult, Driver, Pick, Team, RaceScore, ScoringConfig } from '@/types';
import { POSITION_POINTS } from '@/types';
import { LocalTime } from '@/components/LocalTime';
import { RaceNavigation } from '@/components/RaceNavigation';
import { TeamPicksTable } from '@/components/TeamPicksTable';
import { getPointsForPosition, getStage1BonusPoints, getStage2BonusPoints, getStage3BonusPoints, getLapsLedBonusPoints } from '@/lib/scoring-config';

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

  // Get scoring config for this season
  const { data: scoringConfig } = await supabase
    .from('scoring_configs')
    .select('*')
    .eq('season_id', race.season_id)
    .single();

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

    if (count === 1) return 'bg-green-800/40 text-green-300 border border-green-700/50'; // Unique
    if (percentage <= 20) return 'bg-green-500/30 text-green-300 border border-green-400/50'; // Rare
    if (percentage <= 35) return 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50'; // Uncommon
    if (percentage <= 50) return 'bg-orange-500/30 text-orange-300 border border-orange-500/50'; // Common
    if (percentage <= 70) return 'bg-red-400/30 text-red-300 border border-red-400/50'; // Popular
    return 'bg-red-700/40 text-red-300 border border-red-700/50'; // Chalk
  };

  const formatPoints = (position: number) => {
    return getPointsForPosition(position, scoringConfig);
  };

  // Calculate total points for a driver including bonuses
  const calculateDriverTotalPoints = (result: any) => {
    const positionPoints = getPointsForPosition(result.finish_position, scoringConfig);
    const s1Bonus = result.stage_1_winner ? getStage1BonusPoints(scoringConfig) : 0;
    const s2Bonus = result.stage_2_winner ? getStage2BonusPoints(scoringConfig) : 0;
    const s3Bonus = result.stage_3_winner ? getStage3BonusPoints(scoringConfig) : 0;
    const lapsLedBonus = result.most_laps_led ? getLapsLedBonusPoints(scoringConfig) : 0;
    return positionPoints + s1Bonus + s2Bonus + s3Bonus + lapsLedBonus;
  };

  // Find stage winners and most laps led
  const stage1Winner = results?.find((r: any) => r.stage_1_winner);
  const stage2Winner = results?.find((r: any) => r.stage_2_winner);
  const stage3Winner = results?.find((r: any) => r.stage_3_winner);
  const mostLapsLed = results?.find((r: any) => r.most_laps_led);

  // Get abbreviated driver name: "F. LastName"
  const getShortDriverName = (fullName: string): string => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return `${firstName[0]}. ${lastName}`;
  };

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
              <LocalTime dateStr={race.scheduled_datetime} format="longDate" />
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
            {stage3Winner && (
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-gray-400 text-sm">Stage 3 Winner</div>
                <div className="text-white font-medium">
                  #{stage3Winner.driver?.car_number} {stage3Winner.driver?.name}
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

      {/* Race Navigation */}
      <RaceNavigation currentRace={race} basePath="results" />

      {/* All Teams' Picks */}
      {picks && picks.length > 0 && (
        <TeamPicksTable
          picks={picks}
          resultsMap={resultsMap}
          driverPickCounts={driverPickCounts}
          userTeamId={userTeamId}
          scores={scores}
          scoringConfig={scoringConfig}
        />
      )}

      {/* Race Results */}
      {results && results.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 md:p-6">
          <h2 className="text-xl font-bold text-white mb-4">Full Race Results</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-xs md:text-sm border-b border-gray-700">
                  <th className="pb-3 pr-2 md:pr-4">Pos</th>
                  <th className="pb-3 pr-2 md:pr-4">#</th>
                  <th className="pb-3 pr-2 md:pr-4">Driver</th>
                  <th className="pb-3 pr-4 hidden md:table-cell">Team</th>
                  <th className="pb-3 text-center">Pts</th>
                  <th className="pb-3 text-center">Picked</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result: any) => {
                  const pickCount = driverPickCounts[result.driver_id] || 0;

                  return (
                    <tr key={result.id} className="border-b border-gray-700/50">
                      <td className="py-2 md:py-3 pr-2 md:pr-4">
                        <span className={`font-bold text-sm md:text-base ${
                          result.finish_position === 1 ? 'text-yellow-500' :
                          result.finish_position <= 3 ? 'text-gray-300' :
                          result.finish_position <= 10 ? 'text-green-500' : 'text-gray-500'
                        }`}>
                          {result.finish_position}
                        </span>
                      </td>
                      <td className="py-2 md:py-3 pr-2 md:pr-4 text-yellow-500 font-bold text-sm md:text-base">
                        {result.driver?.car_number}
                      </td>
                      <td className="py-2 md:py-3 pr-2 md:pr-4">
                        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                          {/* Full name on desktop, abbreviated on mobile */}
                          <span className="text-white text-sm md:text-base hidden md:inline">{result.driver?.name}</span>
                          <span className="text-white text-sm md:hidden">{getShortDriverName(result.driver?.name || '')}</span>
                          <div className="flex gap-0.5">
                            {result.stage_1_winner && (
                              <span className="px-1 md:px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] md:text-xs rounded">S1</span>
                            )}
                            {result.stage_2_winner && (
                              <span className="px-1 md:px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] md:text-xs rounded">S2</span>
                            )}
                            {result.stage_3_winner && (
                              <span className="px-1 md:px-1.5 py-0.5 bg-pink-500/20 text-pink-400 text-[10px] md:text-xs rounded">S3</span>
                            )}
                            {result.most_laps_led && (
                              <span className="px-1 md:px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] md:text-xs rounded">ML</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 md:py-3 pr-4 text-gray-400 hidden md:table-cell">{result.driver?.team_name}</td>
                      <td className="py-2 md:py-3 text-center">
                        {(() => {
                          const posPoints = formatPoints(result.finish_position);
                          const totalPoints = calculateDriverTotalPoints(result);
                          const hasBonus = totalPoints > posPoints;
                          return (
                            <div className="flex items-center justify-center gap-0.5 md:gap-1">
                              <span className="text-white font-medium text-sm md:text-base">{totalPoints}</span>
                              {hasBonus && (
                                <span className="text-green-400 text-[10px] md:text-xs hidden sm:inline">
                                  (+{totalPoints - posPoints})
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-2 md:py-3 text-center">
                        <span className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded text-xs md:text-sm ${getOverlapColor(pickCount)}`}>
                          {pickCount}
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
