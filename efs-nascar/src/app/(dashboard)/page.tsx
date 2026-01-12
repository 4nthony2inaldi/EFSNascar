import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import type { Race, Team, Standing, Pick, Track, TrackType, Season } from '@/types';
import { LocalTime } from '@/components/LocalTime';
import { SeasonSelector } from '@/components/SeasonSelector';

interface RaceWithTrack extends Race {
  track_info: Track | null;
}

interface DashboardPageProps {
  searchParams: Promise<{ season?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient();
  const params = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();

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

  // Determine which season to display (from URL param or default to active)
  const selectedSeasonId = params.season || activeSeason?.id;
  const selectedSeason = seasons.find(s => s.id === selectedSeasonId) || activeSeason;
  const isViewingActiveSeason = selectedSeasonId === activeSeason?.id;

  // Get user's team
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user?.id)
    .single();

  const userTeam = membership?.team as Team | null;

  // Get next upcoming race for the selected season with track info (only for active season)
  let nextRaceData = null;
  if (isViewingActiveSeason) {
    const { data } = await supabase
      .from('races')
      .select(`
        *,
        track_info:tracks(*)
      `)
      .eq('season_id', selectedSeasonId)
      .eq('status', 'upcoming')
      .order('scheduled_datetime', { ascending: true })
      .limit(1)
      .single();
    nextRaceData = data;
  }

  const nextRace = nextRaceData as RaceWithTrack | null;

  // Helper to get track type info
  const getTrackTypeInfo = (trackType: TrackType | undefined) => {
    switch (trackType) {
      case 'superspeedway':
        return { label: 'Superspeedway', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '🏁' };
      case 'intermediate':
        return { label: 'Intermediate', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: '🔵' };
      case 'short_track':
        return { label: 'Short Track', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: '🟡' };
      case 'road_course':
        return { label: 'Road Course', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '🟢' };
      case 'street_course':
        return { label: 'Street Course', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: '🏙️' };
      case 'dirt':
        return { label: 'Dirt', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: '🟤' };
      default:
        return null;
    }
  };

  // Check if user has submitted picks for next race
  let hasPicked = false;
  let userPick: Pick | null = null;
  if (nextRace && userTeam) {
    const { data: pick } = await supabase
      .from('picks')
      .select('*')
      .eq('team_id', userTeam.id)
      .eq('race_id', nextRace.id)
      .single();
    hasPicked = !!pick;
    userPick = pick as Pick | null;
  }

  // Get all standings for the selected season
  let { data: standings } = await supabase
    .from('standings')
    .select('*, team:teams(*)')
    .eq('season_id', selectedSeasonId)
    .is('race_id', null) // Season totals
    .order('rank', { ascending: true });

  // Get all race scores for the selected season (used for laps_led calculation and fallback standings)
  const { data: raceScoresData } = await supabase
    .from('race_scores')
    .select('*, team:teams(*), race:races!inner(season_id)')
    .eq('race.season_id', selectedSeasonId);

  // Check if standings have meaningful data (at least one team with points)
  const hasStandingsData = standings && standings.length > 0 &&
    standings.some((s: any) => s.total_points > 0);

  // If no pre-calculated standings OR standings have no points, calculate from race_scores
  if (!hasStandingsData && raceScoresData && raceScoresData.length > 0) {
    // Aggregate scores by team
    const teamTotals: Record<string, {
      team_id: string;
      team: any;
      total_points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
      laps_led_bonuses: number;
    }> = {};

    for (const score of raceScoresData) {
      if (!teamTotals[score.team_id]) {
        teamTotals[score.team_id] = {
          team_id: score.team_id,
          team: score.team,
          total_points: 0,
          race_wins: 0,
          stage_wins: 0,
          top_10_bonuses: 0,
          laps_led_bonuses: 0,
        };
      }
      teamTotals[score.team_id].total_points += score.total_points || 0;
      teamTotals[score.team_id].top_10_bonuses += score.top_10_bonus || 0;
      teamTotals[score.team_id].laps_led_bonuses += score.laps_led_bonus || 0;
      teamTotals[score.team_id].stage_wins += score.stage_bonus || 0;
      if (score.driver_1_points === 10 || score.driver_2_points === 10 || score.driver_3_points === 10) {
        teamTotals[score.team_id].race_wins += 1;
      }
    }

    const calculatedStandings = Object.values(teamTotals)
      .sort((a, b) => b.total_points - a.total_points)
      .map((team, index) => ({
        id: `calc-${team.team_id}`,
        team_id: team.team_id,
        season_id: selectedSeasonId,
        race_id: null,
        total_points: team.total_points,
        race_wins: team.race_wins,
        stage_wins: team.stage_wins,
        top_10_bonuses: team.top_10_bonuses,
        rank: index + 1,
        team: team.team,
        updated_at: new Date().toISOString(),
      }));

    standings = calculatedStandings as any;
  }

  // Aggregate laps_led_bonuses per team
  const lapsLedByTeam: Record<string, number> = {};
  for (const score of raceScoresData || []) {
    if (!lapsLedByTeam[score.team_id]) {
      lapsLedByTeam[score.team_id] = 0;
    }
    lapsLedByTeam[score.team_id] += score.laps_led_bonus || 0;
  }

  // Calculate user's standing info
  const userStanding = standings?.find((s: any) => s.team_id === userTeam?.id);
  const userRank = userStanding?.rank || null;
  const userPoints = userStanding?.total_points || 0;

  // Find points at key positions for deficit calculations
  const getPointsAtRank = (rank: number) => {
    const standing = standings?.find((s: any) => s.rank === rank);
    return standing?.total_points || 0;
  };

  const points2nd = getPointsAtRank(2); // Second catbird seat
  const points6th = getPointsAtRank(6); // Last standard playoff spot
  const points15th = getPointsAtRank(15); // Last consolation spot (above muddy mile)

  // Calculate deficits (positive = ahead, negative = behind)
  const deficitVs2nd = userPoints - points2nd;
  const deficitVs6th = userPoints - points6th;
  const deficitVs15th = userPoints - points15th;

  // Get user's designation
  const getUserDesignation = (rank: number | null) => {
    if (!rank) return null;
    if (rank <= 2) return { emoji: '🐱', label: 'Catbird Seat', color: 'text-amber-400' };
    if (rank <= 6) return { emoji: '✅', label: 'Playoff Position', color: 'text-emerald-400' };
    if (rank === 7) return { emoji: '🐕', label: 'Lucky Dog', color: 'text-amber-400' };
    if (rank >= 16) return { emoji: '💩', label: 'Muddy Mile', color: 'text-red-400' };
    return { emoji: '', label: 'Consolation', color: 'text-purple-400' };
  };

  const userDesignation = getUserDesignation(userRank);

  // Calculate Lucky Dog points and ranking
  // Lucky Dog: team outside top 6 with most race wins, with tiebreakers:
  // 1. Race wins, 2. Stage wins, 3. Laps led leaders chosen, 4. Top 10 bonuses
  interface LuckyDogStats {
    team_id: string;
    team_name: string;
    rank: number;
    total_points: number;
    race_wins: number;
    stage_wins: number;
    laps_led_bonuses: number;
    top_10_bonuses: number;
  }

  const luckyDogEligible: LuckyDogStats[] = (standings || [])
    .filter((s: any) => s.rank && s.rank > 6)
    .map((s: any) => ({
      team_id: s.team_id,
      team_name: s.team?.name || 'Unknown',
      rank: s.rank,
      total_points: s.total_points,
      race_wins: s.race_wins || 0,
      stage_wins: s.stage_wins || 0,
      laps_led_bonuses: lapsLedByTeam[s.team_id] || 0,
      top_10_bonuses: s.top_10_bonuses || 0,
    }));

  // Sort by lucky dog criteria
  luckyDogEligible.sort((a, b) => {
    if (b.race_wins !== a.race_wins) return b.race_wins - a.race_wins;
    if (b.stage_wins !== a.stage_wins) return b.stage_wins - a.stage_wins;
    if (b.laps_led_bonuses !== a.laps_led_bonuses) return b.laps_led_bonuses - a.laps_led_bonuses;
    return b.top_10_bonuses - a.top_10_bonuses;
  });

  // Find user's lucky dog rank (1 = in lucky dog position)
  const userLuckyDogRank = userRank && userRank > 6
    ? luckyDogEligible.findIndex((t) => t.team_id === userTeam?.id) + 1
    : null;

  // Get the team in actual lucky dog position for comparison
  const luckyDogLeader = luckyDogEligible[0] || null;

  // Get recent announcements
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*, author:profiles(name)')
    .order('posted_at', { ascending: false })
    .limit(3);

  // Calculate countdown to deadline
  const getTimeUntilDeadline = (deadline: string) => {
    const now = Date.now();
    const deadlineTime = new Date(deadline).getTime();
    const diff = deadlineTime - now;

    if (diff <= 0) return 'Deadline passed';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Check if deadline is actually passed (for conditional rendering)
  const isDeadlinePassed = nextRace ? new Date(nextRace.deadline_datetime).getTime() < Date.now() : false;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-purple-400 mt-1">
            {selectedSeason ? `${selectedSeason.name} Season` : 'No active season'}
          </p>
        </div>
        {seasons.length > 0 && selectedSeasonId && (
          <SeasonSelector
            seasons={seasons}
            currentSeasonId={selectedSeasonId}
            basePath="/"
          />
        )}
      </div>

      {/* Alert if no team */}
      {!userTeam && (
        <div className="bg-amber-500/10 border border-amber-500/50 text-amber-400 px-4 py-3 rounded-lg">
          <p className="font-medium">You&apos;re not assigned to a team yet.</p>
          <p className="text-sm mt-1 text-amber-400/80">Contact a commissioner to be added to a team.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Next Race Card */}
        <div className="lg:col-span-2 glass rounded-xl p-6 card-hover">
          <h2 className="text-xl font-bold text-white mb-4">Next Race</h2>
          {nextRace ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  {/* Track Logo */}
                  <div className="relative w-20 h-20 flex-shrink-0 bg-purple-900/30 rounded-lg overflow-hidden flex items-center justify-center border border-purple-700/30">
                    {nextRace.track_info?.logo_url ? (
                      <Image
                        src={nextRace.track_info.logo_url}
                        alt={nextRace.track_info.name}
                        width={72}
                        height={72}
                        className="object-contain"
                      />
                    ) : (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                          {nextRace.race_number}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">{nextRace.name}</h3>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <p className="text-purple-300">{nextRace.track}</p>
                      {nextRace.track_info && (
                        <span className={`px-2 py-0.5 text-xs rounded border ${getTrackTypeInfo(nextRace.track_info.track_type)?.color || ''}`}>
                          {getTrackTypeInfo(nextRace.track_info.track_type)?.icon} {getTrackTypeInfo(nextRace.track_info.track_type)?.label}
                          {nextRace.track_info.length_miles && (
                            <span className="ml-1 opacity-75">({nextRace.track_info.length_miles} mi)</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-purple-400">Deadline</div>
                  <div className="text-2xl font-bold text-white">
                    {getTimeUntilDeadline(nextRace.deadline_datetime)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-purple-400 mb-6">
                <span>
                  Race #{nextRace.race_number} •{' '}
                  <LocalTime dateStr={nextRace.scheduled_datetime} format="long" />
                </span>
              </div>

              {userTeam && (
                <div className="flex items-center justify-between">
                  {isDeadlinePassed ? (
                    <div className={`flex items-center ${hasPicked ? 'text-emerald-400' : 'text-red-400'}`}>
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        {hasPicked ? (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        ) : (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        )}
                      </svg>
                      {hasPicked ? 'Picks submitted' : 'Deadline missed'}
                    </div>
                  ) : hasPicked ? (
                    <div className="flex items-center text-emerald-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Picks submitted
                    </div>
                  ) : (
                    <div className="flex items-center text-amber-400">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Picks not submitted
                    </div>
                  )}
                  {isDeadlinePassed ? (
                    <Link
                      href={`/races/${nextRace.id}/picks`}
                      className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 shadow-lg shadow-purple-500/25 transition-all"
                    >
                      View All Picks
                    </Link>
                  ) : (
                    <Link
                      href={`/picks?race=${nextRace.id}`}
                      className="px-5 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
                    >
                      {hasPicked ? 'Edit Picks' : 'Submit Picks'}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-purple-400">
              {!isViewingActiveSeason ? (
                <div className="text-center py-4">
                  <p className="text-lg mb-2">Viewing {selectedSeason?.name} Season</p>
                  <p className="text-sm text-purple-500">This is a past season. Switch to the current season to see upcoming races.</p>
                </div>
              ) : (
                <p>No upcoming races scheduled.</p>
              )}
            </div>
          )}
        </div>

        {/* Your Team Card - Enhanced */}
        {userTeam && (
          <div className="glass rounded-xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Your Team</h2>
              {userRank && (
                <div className={`flex items-center gap-1 ${userDesignation?.color || 'text-purple-400'}`}>
                  <span className="text-lg font-bold">#{userRank}</span>
                  {userDesignation?.emoji && <span>{userDesignation.emoji}</span>}
                </div>
              )}
            </div>

            {/* Team Identity */}
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600/30 to-purple-800/30 border border-purple-500/30 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                {userTeam.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={userTeam.logo_url}
                    alt={userTeam.name}
                    className="w-14 h-14 object-cover rounded-full"
                  />
                ) : (
                  <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">#{userTeam.car_number}</span>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{userTeam.name}</h3>
                {userDesignation && (
                  <span className={`text-sm ${userDesignation.color}`}>{userDesignation.label}</span>
                )}
              </div>
            </div>

            {/* Points */}
            {userStanding && (
              <div className="mb-4 p-3 bg-purple-900/30 rounded-lg">
                <div className="text-center">
                  <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                    {userPoints}
                  </div>
                  <div className="text-xs text-purple-400">Total Points</div>
                </div>
              </div>
            )}

            {/* Position Deficits */}
            {userStanding && standings && standings.length > 0 && (
              <div className="space-y-2 mb-4">
                <div className="text-xs text-purple-400 uppercase tracking-wider mb-2">Position Gaps</div>

                {/* vs 2nd (Catbird Seat) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 2nd 🐱</span>
                  <span className={deficitVs2nd >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs2nd >= 0 ? '+' : ''}{deficitVs2nd}
                  </span>
                </div>

                {/* vs 6th (Last Playoff Spot) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 6th ✅</span>
                  <span className={deficitVs6th >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs6th >= 0 ? '+' : ''}{deficitVs6th}
                  </span>
                </div>

                {/* vs 15th (Last Consolation Spot) */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-purple-300">vs 15th</span>
                  <span className={deficitVs15th >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {deficitVs15th >= 0 ? '+' : ''}{deficitVs15th}
                  </span>
                </div>
              </div>
            )}

            {/* Lucky Dog Standings (only if outside top 6) */}
            {userLuckyDogRank && userStanding && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-amber-400 font-medium">🐕 Lucky Dog Race</span>
                  <span className="text-sm font-bold text-amber-400">
                    {userLuckyDogRank === 1 ? 'In Position!' : `#${userLuckyDogRank}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-purple-300">
                    Wins: <span className="text-white font-medium">{userStanding.race_wins || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Stages: <span className="text-white font-medium">{userStanding.stage_wins || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Laps Led: <span className="text-white font-medium">{lapsLedByTeam[userTeam.id] || 0}</span>
                  </div>
                  <div className="text-purple-300">
                    Top 10s: <span className="text-white font-medium">{userStanding.top_10_bonuses || 0}</span>
                  </div>
                </div>
                {userLuckyDogRank > 1 && luckyDogLeader && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-xs text-purple-400">
                    Leader: {luckyDogLeader.team_name} ({luckyDogLeader.race_wins}W / {luckyDogLeader.stage_wins}S)
                  </div>
                )}
              </div>
            )}

            <Link
              href={`/teams/${userTeam.id}`}
              className="block text-center text-amber-400 hover:text-amber-300 text-sm"
            >
              View Team Profile →
            </Link>
          </div>
        )}
      </div>

      {/* Standings Preview */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Standings</h2>
          <Link
            href="/standings"
            className="text-amber-400 hover:text-amber-300 text-sm"
          >
            View Full Standings →
          </Link>
        </div>

        {standings && standings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-purple-400 text-sm border-b border-purple-700/30">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Team</th>
                  <th className="pb-3 pr-4 text-right">Points</th>
                  <th className="pb-3 text-right">Wins</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing: any, index: number) => {
                  const rank = standing.rank || index + 1;

                  // Determine rank color and status label
                  let rankColor = 'text-purple-400';
                  let statusLabel = '';

                  if (rank <= 2) {
                    rankColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300';
                    statusLabel = '🐱';
                  } else if (rank <= 6) {
                    rankColor = 'text-emerald-400';
                  } else if (rank === 7) {
                    rankColor = 'text-amber-400';
                    statusLabel = '🐶';
                  } else if (rank >= 16) {
                    rankColor = 'text-red-400';
                    statusLabel = '💩';
                  }

                  return (
                    <tr
                      key={standing.id}
                      className={`border-b border-purple-800/20 ${
                        standing.team?.id === userTeam?.id ? 'bg-amber-500/10' : ''
                      }`}
                    >
                      <td className="py-3 pr-4">
                        <span className={`font-bold ${rankColor}`}>
                          {rank}
                        </span>
                        {statusLabel && <span className="ml-1">{statusLabel}</span>}
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/teams/${standing.team?.id}`}
                          className="flex items-center hover:text-amber-400 transition-colors"
                        >
                          <span className="text-amber-400 font-bold mr-2">
                            #{standing.team?.car_number}
                          </span>
                          <span className="text-white hover:text-amber-300">{standing.team?.name}</span>
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-right text-white font-medium">
                        {standing.total_points}
                      </td>
                      <td className="py-3 text-right text-purple-300">
                        {standing.race_wins}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-purple-400">No standings data available yet.</p>
        )}
      </div>

      {/* Recent Announcements */}
      {announcements && announcements.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Announcements</h2>
          <div className="space-y-4">
            {announcements.map((announcement: any) => (
              <div key={announcement.id} className="border-l-4 border-amber-500 pl-4">
                <h3 className="text-white font-medium">{announcement.title}</h3>
                <p className="text-purple-300 text-sm mt-1">{announcement.body}</p>
                <p className="text-purple-500 text-xs mt-2">
                  {announcement.author?.name} •{' '}
                  <LocalTime dateStr={announcement.posted_at} format="dateOnly" />
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
