import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const raceId = request.nextUrl.searchParams.get('raceId');
  const seasonId = request.nextUrl.searchParams.get('seasonId');

  if (!raceId || !seasonId) {
    return NextResponse.json({ error: 'raceId and seasonId are required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify commissioner
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_commissioner')
      .eq('id', user.id)
      .single();
    if (!profile?.is_commissioner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all data in parallel
    const [
      raceRes,
      scoresRes,
      standingsRes,
      allRacesRes,
      picksRes,
      resultsRes,
    ] = await Promise.all([
      // Current race info
      supabase.from('races').select('*').eq('id', raceId).single(),
      // Race scores for this race (with team details)
      supabase
        .from('race_scores')
        .select('*, team:teams(id, name, car_number, abbreviation)')
        .eq('race_id', raceId)
        .order('total_points', { ascending: false }),
      // Current season standings (with team details)
      supabase
        .from('standings')
        .select('*, team:teams(id, name, car_number, abbreviation)')
        .eq('season_id', seasonId)
        .is('race_id', null)
        .order('total_points', { ascending: false }),
      // All races in season (to find previous race)
      supabase
        .from('races')
        .select('id, race_number, name, track, status')
        .eq('season_id', seasonId)
        .in('race_type', ['regular', 'playoff_round1', 'playoff_round2', 'playoff_finals'])
        .order('race_number', { ascending: true }),
      // Picks for this race (to find which drivers each team picked)
      supabase
        .from('picks')
        .select('*, team:teams(id, name, car_number), driver_1:drivers!picks_driver_1_id_fkey(id, name), driver_2:drivers!picks_driver_2_id_fkey(id, name), driver_3:drivers!picks_driver_3_id_fkey(id, name)')
        .eq('race_id', raceId),
      // Race results for this race
      supabase
        .from('race_results')
        .select('*, driver:drivers(id, name)')
        .eq('race_id', raceId)
        .order('finish_position', { ascending: true }),
    ]);

    if (raceRes.error) return NextResponse.json({ error: raceRes.error.message }, { status: 500 });
    if (scoresRes.error) return NextResponse.json({ error: scoresRes.error.message }, { status: 500 });
    if (standingsRes.error) return NextResponse.json({ error: standingsRes.error.message }, { status: 500 });

    const race = raceRes.data;
    const scores = scoresRes.data || [];
    const standings = standingsRes.data || [];
    const allRaces = allRacesRes.data || [];
    const picks = picksRes.data || [];
    const results = resultsRes.data || [];

    // Find previous race to calculate rank movement
    const currentRaceIdx = allRaces.findIndex((r: any) => r.id === raceId);
    const previousRaceId = currentRaceIdx > 0 ? allRaces[currentRaceIdx - 1].id : null;

    let previousStandings: any[] = [];
    if (previousRaceId) {
      // Get all race scores up to the previous race to reconstruct previous standings
      const prevFinalRaces = allRaces
        .filter((r: any) => r.status === 'final' && r.race_number < race.race_number)
        .map((r: any) => r.id);

      if (prevFinalRaces.length > 0) {
        const { data: prevScores } = await supabase
          .from('race_scores')
          .select('team_id, total_points')
          .in('race_id', prevFinalRaces);

        if (prevScores) {
          // Aggregate previous scores per team
          const prevTotals = new Map<string, number>();
          for (const s of prevScores) {
            prevTotals.set(s.team_id, (prevTotals.get(s.team_id) || 0) + s.total_points);
          }
          // Sort by points descending to get previous ranks
          previousStandings = Array.from(prevTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([teamId, pts], idx) => ({ team_id: teamId, rank: idx + 1, total_points: pts }));
        }
      }
    }

    // Build previous rank lookup
    const prevRankMap = new Map<string, number>();
    for (const ps of previousStandings) {
      prevRankMap.set(ps.team_id, ps.rank);
    }

    // Build score lookup per team
    const scoreMap = new Map<string, any>();
    for (const s of scores) {
      scoreMap.set(s.team_id, s);
    }

    // Find race winner (finish_position = 1)
    const raceWinner = results.find((r: any) => r.finish_position === 1);

    // Find stage winners
    const stageWinners: { stage: number; driver: string }[] = [];
    for (const r of results) {
      if (r.stage_1_winner) stageWinners.push({ stage: 1, driver: r.driver?.name || 'Unknown' });
      if (r.stage_2_winner) stageWinners.push({ stage: 2, driver: r.driver?.name || 'Unknown' });
      if (r.stage_3_winner) stageWinners.push({ stage: 3, driver: r.driver?.name || 'Unknown' });
    }

    // Find which teams picked stage winners
    const stageWinnerTeams: { stage: number; teamName: string; carNumber: number; driverName: string }[] = [];
    for (const sw of stageWinners) {
      for (const pick of picks) {
        const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
        const matchResult = results.find((r: any) =>
          r.driver?.name === sw.driver &&
          driverIds.includes(r.driver_id) &&
          ((sw.stage === 1 && r.stage_1_winner) ||
           (sw.stage === 2 && r.stage_2_winner) ||
           (sw.stage === 3 && r.stage_3_winner))
        );
        if (matchResult) {
          stageWinnerTeams.push({
            stage: sw.stage,
            teamName: pick.team?.name || 'Unknown',
            carNumber: pick.team?.car_number || 0,
            driverName: sw.driver,
          });
        }
      }
    }

    // Find most laps led driver
    const mostLapsLed = results.find((r: any) => r.most_laps_led);

    // Build enriched standings with movement and weekly score
    const enrichedStandings = standings
      .sort((a: any, b: any) => (b.total_points || 0) - (a.total_points || 0))
      .map((s: any, idx: number) => {
        const currentRank = idx + 1;
        const prevRank = prevRankMap.get(s.team_id) || currentRank;
        const movement = prevRank - currentRank; // positive = moved up
        const weekScore = scoreMap.get(s.team_id);

        return {
          rank: currentRank,
          movement,
          teamId: s.team_id,
          teamName: s.team?.name || 'Unknown',
          carNumber: s.team?.car_number || 0,
          abbreviation: s.team?.abbreviation || '',
          totalPoints: s.total_points || 0,
          raceWins: s.race_wins || 0,
          stageWins: s.stage_wins || 0,
          top10Bonuses: s.top_10_bonuses || 0,
          weeklyScore: weekScore?.total_points || 0,
          weeklyBreakdown: weekScore ? {
            driver1: weekScore.driver_1_points,
            driver2: weekScore.driver_2_points,
            driver3: weekScore.driver_3_points,
            stageBonus: weekScore.stage_bonus,
            lapsLedBonus: weekScore.laps_led_bonus,
            top10Bonus: weekScore.top_10_bonus,
          } : null,
        };
      });

    // Top scorer
    const topScorer = enrichedStandings.length > 0
      ? enrichedStandings.reduce((best: any, s: any) => s.weeklyScore > best.weeklyScore ? s : best, enrichedStandings[0])
      : null;

    // Find the top scorer's driver breakdown
    let topScorerDrivers: { name: string; points: number }[] = [];
    if (topScorer) {
      const topPick = picks.find((p: any) => p.team_id === topScorer.teamId);
      if (topPick && topScorer.weeklyBreakdown) {
        topScorerDrivers = [
          { name: topPick.driver_1?.name || 'D1', points: topScorer.weeklyBreakdown.driver1 },
          { name: topPick.driver_2?.name || 'D2', points: topScorer.weeklyBreakdown.driver2 },
          { name: topPick.driver_3?.name || 'D3', points: topScorer.weeklyBreakdown.driver3 },
        ].sort((a, b) => b.points - a.points);
      }
    }

    // Full Speed Bonus teams (top_10_bonus > 0)
    const fullSpeedTeams = enrichedStandings.filter((s: any) => s.weeklyBreakdown?.top10Bonus > 0);

    // Biggest mover (most positive movement)
    const biggestMover = enrichedStandings.length > 0
      ? enrichedStandings.reduce((best: any, s: any) => s.movement > best.movement ? s : best, enrichedStandings[0])
      : null;

    // Worst week (lowest weekly score, excluding 0 which means no pick)
    const worstWeek = enrichedStandings.filter((s: any) => s.weeklyScore > 0).length > 0
      ? enrichedStandings
          .filter((s: any) => s.weeklyScore > 0)
          .reduce((worst: any, s: any) => s.weeklyScore < worst.weeklyScore ? s : worst)
      : null;

    // Build bonuses string for top scorer
    const topScorerBonuses: string[] = [];
    if (topScorer?.weeklyBreakdown?.stageBonus > 0) topScorerBonuses.push('Stage Win');
    if (topScorer?.weeklyBreakdown?.lapsLedBonus > 0) topScorerBonuses.push('Most Laps Led');
    if (topScorer?.weeklyBreakdown?.top10Bonus > 0) topScorerBonuses.push('Full Speed');

    return NextResponse.json({
      race: {
        name: race.name,
        track: race.track,
        date: race.scheduled_datetime,
        raceNumber: race.race_number,
      },
      highlights: {
        topScorer: topScorer ? {
          teamName: topScorer.teamName,
          carNumber: topScorer.carNumber,
          points: topScorer.weeklyScore,
          drivers: topScorerDrivers,
          bonuses: topScorerBonuses,
        } : null,
        stageWinners: stageWinnerTeams,
        fullSpeedTeams: fullSpeedTeams.map((t: any) => ({
          teamName: t.teamName,
          carNumber: t.carNumber,
        })),
        biggestMover: biggestMover && biggestMover.movement > 0 ? {
          teamName: biggestMover.teamName,
          carNumber: biggestMover.carNumber,
          from: biggestMover.rank + biggestMover.movement,
          to: biggestMover.rank,
        } : null,
        worstWeek: worstWeek ? {
          teamName: worstWeek.teamName,
          carNumber: worstWeek.carNumber,
          points: worstWeek.weeklyScore,
          movement: worstWeek.movement,
          from: worstWeek.rank - worstWeek.movement,
          to: worstWeek.rank,
        } : null,
        raceWinner: raceWinner ? {
          driverName: raceWinner.driver?.name || 'Unknown',
          lapsLed: raceWinner.laps_led || 0,
        } : null,
        mostLapsLed: mostLapsLed ? {
          driverName: mostLapsLed.driver?.name || 'Unknown',
          lapsLed: mostLapsLed.laps_led || 0,
        } : null,
      },
      standings: enrichedStandings,
      luckyDogLine: 6, // Teams ranked > 6 are below the line
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
