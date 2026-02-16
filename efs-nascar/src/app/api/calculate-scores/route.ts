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
} from '@/lib/scoring-config';

export async function POST(request: Request) {
  try {
    const { race_id } = await request.json();

    if (!race_id) {
      return NextResponse.json({ error: 'race_id is required' }, { status: 400 });
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

    // Get race details
    const { data: race, error: raceError } = await supabase
      .from('races')
      .select('*')
      .eq('id', race_id)
      .single();

    if (raceError || !race) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    // Get scoring configuration for this season
    const { data: scoringConfig } = await supabase
      .from('scoring_configs')
      .select('*')
      .eq('season_id', race.season_id)
      .single();

    // Use scoring config (will use defaults if null)
    const config = scoringConfig as ScoringConfig | null;

    // Get race results
    const { data: results, error: resultsError } = await supabase
      .from('race_results')
      .select('*')
      .eq('race_id', race_id);

    if (resultsError || !results || results.length === 0) {
      return NextResponse.json({ error: 'No results found for this race' }, { status: 400 });
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
      .eq('race_id', race_id);

    if (picksError) {
      return NextResponse.json({ error: 'Failed to fetch picks' }, { status: 500 });
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

    // Track stats for standings update
    const teamStats: Record<string, {
      points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
    }> = {};

    for (const pick of picks || []) {
      const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];
      let driver1Points = 0;
      let driver2Points = 0;
      let driver3Points = 0;
      let stageBonus = 0;
      let lapsLedBonus = 0;
      let top10Bonus = 0;
      let raceWins = 0;
      let stageWins = 0;

      // Calculate points for each driver using scoring config
      const stage1BonusValue = getStage1BonusPoints(config);
      const stage2BonusValue = getStage2BonusPoints(config);
      const stage3BonusValue = getStage3BonusPoints(config);
      const lapsLedBonusValue = getLapsLedBonusPoints(config);
      const top10BonusValue = getTop10AllDriversBonusPoints(config);

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

          // Race winner
          if (result.finish_position === 1) {
            raceWins += 1;
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
        race_id,
        driver_1_points: driver1Points,
        driver_2_points: driver2Points,
        driver_3_points: driver3Points,
        stage_bonus: stageBonus,
        laps_led_bonus: lapsLedBonus,
        top_10_bonus: top10Bonus,
        total_points: totalPoints,
      });

      teamStats[pick.team_id] = {
        points: totalPoints,
        race_wins: raceWins,
        stage_wins: stageWins,
        top_10_bonuses: top10Bonus,
      };
    }

    // Delete existing scores for this race
    await supabase.from('race_scores').delete().eq('race_id', race_id);

    // Insert new scores
    if (scores.length > 0) {
      const { error: scoresError } = await supabase.from('race_scores').insert(scores);
      if (scoresError) {
        console.error('Error inserting scores:', scoresError);
        return NextResponse.json({ error: 'Failed to save scores' }, { status: 500 });
      }
    }

    // Update driver usages
    for (const pick of picks || []) {
      const driverIds = [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id];

      for (const driverId of driverIds) {
        // Check if usage record exists
        const { data: existing } = await supabase
          .from('driver_usages')
          .select('*')
          .eq('team_id', pick.team_id)
          .eq('season_id', race.season_id)
          .eq('driver_id', driverId)
          .single();

        if (existing) {
          // Only increment if this race hasn't been counted yet
          // We use a simple approach: upsert with increment
          await supabase
            .from('driver_usages')
            .update({ times_used: existing.times_used + 1 })
            .eq('id', existing.id);
        } else {
          await supabase.from('driver_usages').insert({
            team_id: pick.team_id,
            season_id: race.season_id,
            driver_id: driverId,
            times_used: 1,
          });
        }
      }
    }

    // Update standings
    // First, get all teams
    const { data: teams } = await supabase.from('teams').select('id');

    // Get all race scores for the season
    const { data: seasonScores } = await supabase
      .from('race_scores')
      .select('*, race:races!inner(season_id)')
      .eq('race.season_id', race.season_id);

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
        teamTotals[score.team_id].stage_wins += score.stage_bonus > 0 ? 1 : 0;
      }
    }

    // Determine race wins by checking which teams picked the actual race winner
    const completedRaces = await supabase
      .from('races')
      .select('id')
      .eq('season_id', race.season_id)
      .eq('status', 'final');

    const completedRaceIds = (completedRaces.data || []).map(r => r.id);
    if (completedRaceIds.length > 0) {
      const [{ data: raceWinners }, { data: seasonPicks }] = await Promise.all([
        supabase.from('race_results').select('race_id, driver_id').eq('finish_position', 1).in('race_id', completedRaceIds),
        supabase.from('picks').select('race_id, team_id, driver_1_id, driver_2_id, driver_3_id').in('race_id', completedRaceIds),
      ]);

      const winnerMap = new Map<string, string>();
      for (const w of raceWinners || []) winnerMap.set(w.race_id, w.driver_id);

      for (const pick of seasonPicks || []) {
        const winnerId = winnerMap.get(pick.race_id);
        if (winnerId && [pick.driver_1_id, pick.driver_2_id, pick.driver_3_id].includes(winnerId)) {
          if (teamTotals[pick.team_id]) {
            teamTotals[pick.team_id].race_wins += 1;
          }
        }
      }
    }

    // Sort teams by points to determine ranks
    const sortedTeams = Object.entries(teamTotals)
      .sort(([, a], [, b]) => b.total_points - a.total_points);

    // Update standings
    for (let i = 0; i < sortedTeams.length; i++) {
      const [teamId, stats] = sortedTeams[i];
      const rank = i + 1;

      // Upsert season standing (race_id = null for season total)
      const { data: existingStanding } = await supabase
        .from('standings')
        .select('id')
        .eq('team_id', teamId)
        .eq('season_id', race.season_id)
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
          season_id: race.season_id,
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
      message: `Scores calculated for ${scores.length} teams`,
      scores,
    });
  } catch (error: any) {
    console.error('Error calculating scores:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
