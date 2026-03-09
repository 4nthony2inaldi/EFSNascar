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
    ]);

    if (raceRes.error) return NextResponse.json({ error: raceRes.error.message }, { status: 500 });
    if (scoresRes.error) return NextResponse.json({ error: scoresRes.error.message }, { status: 500 });
    if (standingsRes.error) return NextResponse.json({ error: standingsRes.error.message }, { status: 500 });

    const race = raceRes.data;
    const scores = scoresRes.data || [];
    const standings = standingsRes.data || [];
    const allRaces = allRacesRes.data || [];
    const picks = picksRes.data || [];

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

    // Top scorers (all teams tied for highest weekly score)
    const maxWeeklyScore = Math.max(...enrichedStandings.map((s: any) => s.weeklyScore));
    const topScorers = maxWeeklyScore > 0
      ? enrichedStandings.filter((s: any) => s.weeklyScore === maxWeeklyScore).map((s: any) => {
          const pick = picks.find((p: any) => p.team_id === s.teamId);
          const drivers = (pick && s.weeklyBreakdown) ? [
            { name: pick.driver_1?.name || 'D1', points: s.weeklyBreakdown.driver1 },
            { name: pick.driver_2?.name || 'D2', points: s.weeklyBreakdown.driver2 },
            { name: pick.driver_3?.name || 'D3', points: s.weeklyBreakdown.driver3 },
          ].sort((a: any, b: any) => b.points - a.points) : [];
          const bonuses: string[] = [];
          if (s.weeklyBreakdown?.stageBonus > 0) bonuses.push('Stage Win');
          if (s.weeklyBreakdown?.lapsLedBonus > 0) bonuses.push('Most Laps Led');
          if (s.weeklyBreakdown?.top10Bonus > 0) bonuses.push('Full Speed');
          return {
            teamName: s.teamName,
            carNumber: s.carNumber,
            points: s.weeklyScore,
            drivers,
            bonuses,
          };
        })
      : [];

    // Biggest movers up (all teams tied for most positive movement)
    const maxUp = Math.max(...enrichedStandings.map((s: any) => s.movement));
    const biggestMoversUp = maxUp > 0
      ? enrichedStandings.filter((s: any) => s.movement === maxUp).map((s: any) => ({
          teamName: s.teamName,
          carNumber: s.carNumber,
          spots: s.movement,
          from: s.rank + s.movement,
          to: s.rank,
        }))
      : [];

    // Biggest movers down (all teams tied for most negative movement)
    const maxDown = Math.min(...enrichedStandings.map((s: any) => s.movement));
    const biggestMoversDown = maxDown < 0
      ? enrichedStandings.filter((s: any) => s.movement === maxDown).map((s: any) => ({
          teamName: s.teamName,
          carNumber: s.carNumber,
          spots: Math.abs(s.movement),
          from: s.rank + s.movement,
          to: s.rank,
        }))
      : [];

    return NextResponse.json({
      race: {
        name: race.name,
        track: race.track,
        date: race.scheduled_datetime,
        raceNumber: race.race_number,
      },
      highlights: {
        topScorers,
        biggestMoversUp,
        biggestMoversDown,
      },
      standings: enrichedStandings,
      luckyDogPosition: 7, // 7th place is the Lucky Dog
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
