import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { ScoringConfig } from '@/types';
import {
  getPointsForPosition,
  getStage1BonusPoints,
  getStage2BonusPoints,
  getStage3BonusPoints,
  getLapsLedBonusPoints,
  getTop10AllDriversBonusPoints,
  compareStandings,
} from '@/lib/scoring-config';

export async function POST(request: Request) {
  try {
    const { season_id } = await request.json();

    if (!season_id) {
      return NextResponse.json({ error: 'season_id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify user is commissioner
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

    // Get scoring configuration for this season
    const { data: scoringConfig } = await supabase
      .from('scoring_configs')
      .select('*')
      .eq('season_id', season_id)
      .single();

    const config = scoringConfig as ScoringConfig | null;

    // Get all races for this season that have results
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, name, race_type, race_number, status')
      .eq('season_id', season_id)
      .eq('status', 'final')
      .order('race_number', { ascending: true });

    if (racesError || !races || races.length === 0) {
      return NextResponse.json({ error: 'No completed races found for this season' }, { status: 400 });
    }

    let totalScoresUpdated = 0;
    const raceResults: { race_number: number; name: string; teams_scored: number }[] = [];

    // Track race wins by team (determined by whether team picked the actual race winner)
    const raceWinsByTeam: Record<string, number> = {};

    // Process each race
    for (const race of races) {
      // Get race results
      const { data: results, error: resultsError } = await supabase
        .from('race_results')
        .select('*')
        .eq('race_id', race.id);

      if (resultsError || !results || results.length === 0) {
        continue; // Skip races without results
      }

      // Build result lookup map
      const resultsByDriver: Record<string, {
        finish_position: number;
        stage_1_winner: boolean;
        stage_2_winner: boolean;
        stage_3_winner: boolean;
        most_laps_led: boolean;
      }> = {};

      results.forEach((r) => {
        resultsByDriver[r.driver_id] = {
          finish_position: r.finish_position,
          stage_1_winner: r.stage_1_winner,
          stage_2_winner: r.stage_2_winner,
          stage_3_winner: r.stage_3_winner,
          most_laps_led: r.most_laps_led,
        };
      });

      // Get all picks for this race
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select('*')
        .eq('race_id', race.id);

      if (picksError || !picks || picks.length === 0) {
        continue; // Skip races without picks
      }

      // Calculate scores for each team
      const scores: Array<{
        team_id: string;
        race_id: string;
        driver_1_points: number;
        driver_2_points: number;
        driver_3_points: number;
        stage_bonus: number;
        laps_led_bonus: number;
        top_10_bonus: number;
        total_points: number;
      }> = [];

      // Get bonus values from config
      const stage1BonusValue = getStage1BonusPoints(config);
      const stage2BonusValue = getStage2BonusPoints(config);
      const stage3BonusValue = getStage3BonusPoints(config);
      const lapsLedBonusValue = getLapsLedBonusPoints(config);
      const top10BonusValue = getTop10AllDriversBonusPoints(config);

      for (const pick of picks) {
        const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
        let driver1Points = 0;
        let driver2Points = 0;
        let driver3Points = 0;
        let stageBonus = 0;
        let stageWins = 0;
        let lapsLedBonus = 0;
        let top10Bonus = 0;

        // Calculate points for each driver using scoring config
        driverIds.forEach((driverId, index) => {
          const result = resultsByDriver[driverId];
          if (result) {
            const points = getPointsForPosition(result.finish_position, config);

            if (index === 0) driver1Points = points;
            else if (index === 1) driver2Points = points;
            else driver3Points = points;

            // Stage bonuses (using per-stage config values)
            if (result.stage_1_winner) {
              stageBonus += stage1BonusValue;
              stageWins += 1;
            }
            if (result.stage_2_winner) {
              stageBonus += stage2BonusValue;
              stageWins += 1;
            }
            if (result.stage_3_winner) {
              stageBonus += stage3BonusValue;
              stageWins += 1;
            }

            // Most laps led bonus (using config value)
            if (result.most_laps_led) {
              lapsLedBonus = lapsLedBonusValue;
            }
          }
        });

        // All 3 drivers in top 10 bonus (using config value)
        const allTop10 = driverIds.every((driverId) => {
          const result = resultsByDriver[driverId];
          return result && result.finish_position <= 10;
        });

        if (allTop10) {
          top10Bonus = top10BonusValue;
        }

        const totalPoints = driver1Points + driver2Points + driver3Points + stageBonus + lapsLedBonus + top10Bonus;

        scores.push({
          team_id: pick.team_id,
          race_id: race.id,
          driver_1_points: driver1Points,
          driver_2_points: driver2Points,
          driver_3_points: driver3Points,
          stage_bonus: stageBonus,
          stage_wins: stageWins,
          laps_led_bonus: lapsLedBonus,
          top_10_bonus: top10Bonus,
          total_points: totalPoints,
        });
      }

      // Track which teams picked the actual race winner
      const raceWinnerResult = results.find(r => r.finish_position === 1);
      if (raceWinnerResult) {
        for (const pick of picks) {
          const pickedDrivers = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
          if (pickedDrivers.includes(raceWinnerResult.driver_id)) {
            raceWinsByTeam[pick.team_id] = (raceWinsByTeam[pick.team_id] || 0) + 1;
          }
        }
      }

      // Delete existing scores for this race
      await supabase.from('race_scores').delete().eq('race_id', race.id);

      // Insert new scores
      if (scores.length > 0) {
        const { error: scoresError } = await supabase.from('race_scores').insert(scores);
        if (scoresError) {
          console.error(`Error inserting scores for race ${race.race_number}:`, scoresError);
          continue;
        }
        totalScoresUpdated += scores.length;
        raceResults.push({
          race_number: race.race_number,
          name: race.name,
          teams_scored: scores.length,
        });
      }
    }

    // Update season standings
    // Get all teams
    const { data: teams } = await supabase.from('teams').select('id');

    // Get all race scores for the season
    const { data: seasonScores } = await supabase
      .from('race_scores')
      .select('*, race:races!inner(season_id)')
      .eq('race.season_id', season_id);

    // Aggregate scores by team
    const teamTotals: Record<string, {
      total_points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
    }> = {};

    for (const team of teams || []) {
      teamTotals[team.id] = {
        total_points: 0,
        race_wins: 0,
        stage_wins: 0,
        top_10_bonuses: 0,
      };
    }

    // Sum up all scores from the season
    for (const score of seasonScores || []) {
      if (teamTotals[score.team_id]) {
        teamTotals[score.team_id].total_points += score.total_points;
        teamTotals[score.team_id].top_10_bonuses += score.top_10_bonus;
        teamTotals[score.team_id].stage_wins += score.stage_wins || score.stage_bonus || 0;
      }
    }

    // Use pre-computed race wins (determined by checking actual picks vs race winners)
    for (const [teamId, wins] of Object.entries(raceWinsByTeam)) {
      if (teamTotals[teamId]) {
        teamTotals[teamId].race_wins = wins;
      }
    }

    // Sort teams by points with tiebreakers to determine ranks
    const sortedTeams = Object.entries(teamTotals)
      .sort(([, a], [, b]) => compareStandings(a, b));

    // Update standings
    for (let i = 0; i < sortedTeams.length; i++) {
      const [teamId, stats] = sortedTeams[i];
      const rank = i + 1;

      // Upsert season standing (race_id = null for season total)
      const { data: existingStanding } = await supabase
        .from('standings')
        .select('id')
        .eq('team_id', teamId)
        .eq('season_id', season_id)
        .is('race_id', null)
        .single();

      if (existingStanding) {
        await supabase
          .from('standings')
          .update({
            total_points: stats.total_points,
            race_wins: stats.race_wins,
            stage_wins: stats.stage_wins,
            top_10_bonuses: stats.top_10_bonuses,
            rank,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingStanding.id);
      } else {
        await supabase.from('standings').insert({
          team_id: teamId,
          season_id: season_id,
          race_id: null,
          total_points: stats.total_points,
          race_wins: stats.race_wins,
          stage_wins: stats.stage_wins,
          top_10_bonuses: stats.top_10_bonuses,
          rank,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Recalculated scores for ${raceResults.length} races (${totalScoresUpdated} team scores updated)`,
      races_processed: raceResults,
    });
  } catch (error: any) {
    console.error('Error recalculating scores:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
