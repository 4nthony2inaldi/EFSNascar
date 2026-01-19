// Scoring configuration utilities
import type { ScoringConfig } from '@/types/database';
import { POSITION_POINTS, BASE_DRIVER_USES, DEFAULT_BONUS_USES } from '@/types';

// Default configuration values (used when no config exists for a season)
export const DEFAULT_SCORING_CONFIG: Omit<ScoringConfig, 'id' | 'season_id' | 'created_at' | 'updated_at'> = {
  position_points: { ...POSITION_POINTS },
  stage_1_bonus: 1,
  stage_2_bonus: 1,
  stage_3_bonus: 1,
  laps_led_bonus: 1,
  top_10_all_drivers_bonus: 1,
  base_driver_uses: BASE_DRIVER_USES,
  bonus_uses_per_season: DEFAULT_BONUS_USES,
  regular_season_races: 22,
  playoff_enabled: true,
  championship_bracket_size: 7,
  catbird_seats: 2,
  consolation_bracket_start: 8,
  consolation_bracket_end: 15,
  muddy_mile_start: 16,
  muddy_mile_end: 17,
  playoff_round1_races: 1,
  playoff_round2_races: 2,
  playoff_finals_races: 2,
  round1_eliminations: 1,
  round2_eliminations: 2,
  tiebreaker_order: ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'],
};

// Convert position points from Record<string, number> to Record<number, number>
export function getPositionPoints(config: ScoringConfig | null): Record<number, number> {
  const positionPoints: Record<number, number> = {};

  const points = config?.position_points || DEFAULT_SCORING_CONFIG.position_points;

  for (const [pos, pts] of Object.entries(points)) {
    const position = parseInt(pos, 10);
    if (!isNaN(position)) {
      positionPoints[position] = pts as number;
    }
  }

  return positionPoints;
}

// Get points for a specific position
export function getPointsForPosition(position: number, config: ScoringConfig | null): number {
  const points = getPositionPoints(config);
  return points[position] || 0;
}

// Get bonus values for each stage
export function getStage1BonusPoints(config: ScoringConfig | null): number {
  return config?.stage_1_bonus ?? DEFAULT_SCORING_CONFIG.stage_1_bonus;
}

export function getStage2BonusPoints(config: ScoringConfig | null): number {
  return config?.stage_2_bonus ?? DEFAULT_SCORING_CONFIG.stage_2_bonus;
}

export function getStage3BonusPoints(config: ScoringConfig | null): number {
  return config?.stage_3_bonus ?? DEFAULT_SCORING_CONFIG.stage_3_bonus;
}

export function getLapsLedBonusPoints(config: ScoringConfig | null): number {
  return config?.laps_led_bonus ?? DEFAULT_SCORING_CONFIG.laps_led_bonus;
}

export function getTop10AllDriversBonusPoints(config: ScoringConfig | null): number {
  return config?.top_10_all_drivers_bonus ?? DEFAULT_SCORING_CONFIG.top_10_all_drivers_bonus;
}

// Get driver usage limits
export function getBaseDriverUses(config: ScoringConfig | null): number {
  return config?.base_driver_uses ?? DEFAULT_SCORING_CONFIG.base_driver_uses;
}

export function getBonusUsesPerSeason(config: ScoringConfig | null): number {
  return config?.bonus_uses_per_season ?? DEFAULT_SCORING_CONFIG.bonus_uses_per_season;
}

// Get playoff configuration
export function getPlayoffConfig(config: ScoringConfig | null) {
  return {
    enabled: config?.playoff_enabled ?? DEFAULT_SCORING_CONFIG.playoff_enabled,
    regularSeasonRaces: config?.regular_season_races ?? DEFAULT_SCORING_CONFIG.regular_season_races,
    championshipBracketSize: config?.championship_bracket_size ?? DEFAULT_SCORING_CONFIG.championship_bracket_size,
    catbirdSeats: config?.catbird_seats ?? DEFAULT_SCORING_CONFIG.catbird_seats,
    consolationStart: config?.consolation_bracket_start ?? DEFAULT_SCORING_CONFIG.consolation_bracket_start,
    consolationEnd: config?.consolation_bracket_end ?? DEFAULT_SCORING_CONFIG.consolation_bracket_end,
    muddyMileStart: config?.muddy_mile_start ?? DEFAULT_SCORING_CONFIG.muddy_mile_start,
    muddyMileEnd: config?.muddy_mile_end ?? DEFAULT_SCORING_CONFIG.muddy_mile_end,
    round1Races: config?.playoff_round1_races ?? DEFAULT_SCORING_CONFIG.playoff_round1_races,
    round2Races: config?.playoff_round2_races ?? DEFAULT_SCORING_CONFIG.playoff_round2_races,
    finalsRaces: config?.playoff_finals_races ?? DEFAULT_SCORING_CONFIG.playoff_finals_races,
    round1Eliminations: config?.round1_eliminations ?? DEFAULT_SCORING_CONFIG.round1_eliminations,
    round2Eliminations: config?.round2_eliminations ?? DEFAULT_SCORING_CONFIG.round2_eliminations,
  };
}
