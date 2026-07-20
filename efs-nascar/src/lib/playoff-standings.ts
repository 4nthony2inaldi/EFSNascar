// Playoff standings calculation utilities
import type { RaceType, ScoringConfig } from '@/types/database';
import { getPlayoffConfig, compareStandings } from '@/lib/scoring-config';

// Playoff configuration extracted from scoring config
export interface PlayoffConfigOptions {
  championshipBracketSize: number;
  catbirdSeats: number;
  consolationStart: number;
  consolationEnd: number;
  muddyMileStart: number;
  muddyMileEnd: number;
  round1Races: number;
  round2Races: number;
  finalsRaces: number;
  round1Eliminations: number;
  round2Eliminations: number;
}

export interface PlayoffTeamStanding {
  team_id: string;
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
    car_number: number;
  };
  total_points: number;
  race_wins: number;
  stage_wins: number;
  top_10_bonuses: number;
  rank: number;
}

export interface PlayoffStandings {
  // Regular season final standings (used to seed playoffs)
  regularSeasonStandings: PlayoffTeamStanding[];

  // Current playoff round info
  playoffRound: 'not_started' | 'round1' | 'round2' | 'finals' | 'complete';

  // Championship bracket (Top 7 seeds)
  championshipBracket: {
    round1: PlayoffTeamStanding[];  // 5 teams competing (seeds 3-7), seeds 1-2 have bye
    round2: PlayoffTeamStanding[];  // 6 teams (survivors + catbird seats)
    finals: PlayoffTeamStanding[];  // 4 teams
    eliminated: string[];  // team_ids that have been eliminated
    catbirdSeats: string[];  // team_ids of top 2 seeds (bye in round 1)
  };

  // Consolation bracket (Seeds 8-15 + eliminated championship teams)
  consolationBracket: PlayoffTeamStanding[];

  // Muddy Mile (Seeds 16-17)
  muddyMile: PlayoffTeamStanding[];
}

export interface RaceScore {
  team_id: string;
  total_points: number;
  driver_1_points: number;
  driver_2_points: number;
  driver_3_points: number;
  stage_bonus: number;
  laps_led_bonus: number;
  top_10_bonus: number;
  race: {
    id: string;
    race_type: RaceType;
    race_number: number;
  };
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
    car_number: number;
  };
}

/**
 * Determines the current playoff round based on completed races
 * Handles 0-race rounds (skipped rounds) appropriately
 */
export function getPlayoffRound(
  completedPlayoffRaces: { race_type: RaceType }[],
  config?: PlayoffConfigOptions | null
): PlayoffStandings['playoffRound'] {
  const round1RacesNeeded = config?.round1Races ?? 1;
  const round2RacesNeeded = config?.round2Races ?? 2;
  const finalsRacesNeeded = config?.finalsRaces ?? 2;

  const round1Races = completedPlayoffRaces.filter(r => r.race_type === 'playoff_round1').length;
  const round2Races = completedPlayoffRaces.filter(r => r.race_type === 'playoff_round2').length;
  const finalsRaces = completedPlayoffRaces.filter(r => r.race_type === 'playoff_finals').length;

  // Handle completion based on what rounds exist
  if (finalsRacesNeeded > 0 && finalsRaces >= finalsRacesNeeded) return 'complete';
  if (finalsRacesNeeded === 0 && round2RacesNeeded > 0 && round2Races >= round2RacesNeeded) return 'complete';
  if (finalsRacesNeeded === 0 && round2RacesNeeded === 0 && round1RacesNeeded > 0 && round1Races >= round1RacesNeeded) return 'complete';

  // Determine current round
  if (finalsRaces > 0 || (round2RacesNeeded > 0 && round2Races >= round2RacesNeeded)) return 'finals';
  if (round2Races > 0 || (round1RacesNeeded > 0 && round1Races >= round1RacesNeeded) || round1RacesNeeded === 0) {
    // If round 1 is skipped (0 races), go straight to round 2 check
    if (round1RacesNeeded === 0 && round2Races > 0) return 'round2';
    if (round1RacesNeeded > 0 && (round2Races > 0 || round1Races >= round1RacesNeeded)) return 'round2';
  }
  if (round1Races > 0) return 'round1';

  return 'not_started';
}

/**
 * Calculates playoff standings from race scores
 * @param scoringConfig Optional scoring configuration from the database
 * @param raceWinnerLookup Map of race_id -> winning driver_id, and "race_id-team_id" -> Set of picked driver IDs
 */
export function calculatePlayoffStandings(
  regularSeasonStandings: PlayoffTeamStanding[],
  playoffRaceScores: RaceScore[],
  scoringConfig?: ScoringConfig | null,
  raceWinnerLookup?: { raceWinnerMap: Map<string, string>; picksLookup: Map<string, Set<string>> } | null
): PlayoffStandings {
  // Get playoff config (uses defaults if scoringConfig is null)
  const playoffOpts = getPlayoffConfig(scoringConfig ?? null);

  // Separate scores by playoff round
  const round1Scores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_round1');
  const round2Scores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_round2');
  const finalsScores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_finals');

  const playoffRound = getPlayoffRound([
    ...round1Scores.map(s => s.race),
    ...round2Scores.map(s => s.race),
    ...finalsScores.map(s => s.race),
  ], playoffOpts);

  // Get team IDs by their regular season seed (using config values)
  const numCatbirdSeats = playoffOpts.catbirdSeats;
  const numChampionship = playoffOpts.championshipBracketSize;
  const consolationStart = playoffOpts.consolationStart - 1; // Convert to 0-indexed
  const consolationEnd = playoffOpts.consolationEnd;
  const muddyStart = playoffOpts.muddyMileStart - 1; // Convert to 0-indexed
  const muddyEnd = playoffOpts.muddyMileEnd;

  const catbirdSeats = regularSeasonStandings.slice(0, numCatbirdSeats).map(s => s.team_id);
  const championshipSeeds = regularSeasonStandings.slice(0, numChampionship).map(s => s.team_id);
  const consolationSeeds = regularSeasonStandings.slice(consolationStart, consolationEnd).map(s => s.team_id);
  const muddyMileSeeds = regularSeasonStandings.slice(muddyStart, muddyEnd).map(s => s.team_id);

  const eliminated: string[] = [];

  // Regular-season tiebreaker stats keyed by team, used to break ties in playoff
  // rounds where teams have equal playoff points (very common in the pre-race state
  // where all round-1 competitors sit at 0).
  const tiebreakerOrder = scoringConfig?.tiebreaker_order;
  const regularSeasonTiebreakersByTeam = new Map<string, { race_wins: number; stage_wins: number; top_10_bonuses: number }>();
  for (const s of regularSeasonStandings) {
    regularSeasonTiebreakersByTeam.set(s.team_id, {
      race_wins: s.race_wins,
      stage_wins: s.stage_wins,
      top_10_bonuses: s.top_10_bonuses,
    });
  }

  // Helper to aggregate scores for a set of teams
  const aggregateScores = (
    teamIds: string[],
    scores: RaceScore[],
    includeTeams: PlayoffTeamStanding[]
  ): PlayoffTeamStanding[] => {
    const teamTotals: Record<string, {
      team_id: string;
      team: PlayoffTeamStanding['team'];
      total_points: number;
      race_wins: number;
      stage_wins: number;
      top_10_bonuses: number;
    }> = {};

    // Initialize from the team list
    for (const standing of includeTeams) {
      if (teamIds.includes(standing.team_id)) {
        teamTotals[standing.team_id] = {
          team_id: standing.team_id,
          team: standing.team,
          total_points: 0,
          race_wins: 0,
          stage_wins: 0,
          top_10_bonuses: 0,
        };
      }
    }

    // Add scores
    for (const score of scores) {
      if (!teamIds.includes(score.team_id)) continue;
      if (!teamTotals[score.team_id]) {
        teamTotals[score.team_id] = {
          team_id: score.team_id,
          team: score.team,
          total_points: 0,
          race_wins: 0,
          stage_wins: 0,
          top_10_bonuses: 0,
        };
      }

      teamTotals[score.team_id].total_points += score.total_points || 0;
      teamTotals[score.team_id].stage_wins += score.stage_bonus || 0;
      teamTotals[score.team_id].top_10_bonuses += score.top_10_bonus || 0;

      // Check for race win by verifying team actually picked the race winner
      if (raceWinnerLookup) {
        const raceId = score.race?.id;
        const winnerId = raceId ? raceWinnerLookup.raceWinnerMap.get(raceId) : null;
        if (winnerId) {
          const pickedDrivers = raceWinnerLookup.picksLookup.get(`${raceId}-${score.team_id}`);
          if (pickedDrivers?.has(winnerId)) {
            teamTotals[score.team_id].race_wins += 1;
          }
        }
      }
    }

    return Object.values(teamTotals)
      .sort((a, b) => {
        // Primary: playoff points. Ties fall back to regular-season tiebreakers so
        // the display order is stable and meaningful when everyone still sits at 0.
        const rsA = regularSeasonTiebreakersByTeam.get(a.team_id);
        const rsB = regularSeasonTiebreakersByTeam.get(b.team_id);
        return compareStandings(
          {
            total_points: a.total_points,
            race_wins: rsA?.race_wins ?? 0,
            stage_wins: rsA?.stage_wins ?? 0,
            top_10_bonuses: rsA?.top_10_bonuses ?? 0,
          },
          {
            total_points: b.total_points,
            race_wins: rsB?.race_wins ?? 0,
            stage_wins: rsB?.stage_wins ?? 0,
            top_10_bonuses: rsB?.top_10_bonuses ?? 0,
          },
          tiebreakerOrder,
        );
      })
      .map((team, index) => ({
        ...team,
        rank: index + 1,
      }));
  };

  // Check if rounds are skipped (0 races configured)
  const round1Skipped = playoffOpts.round1Races === 0;
  const round2Skipped = playoffOpts.round2Races === 0;
  const finalsSkipped = playoffOpts.finalsRaces === 0;

  // Calculate Round 1 standings (seeds after catbird compete)
  // If round 1 is skipped, this will be empty
  const round1Competitors = round1Skipped ? [] : championshipSeeds.slice(numCatbirdSeats);
  const round1Standings = aggregateScores(round1Competitors, round1Scores, regularSeasonStandings);

  // Determine who was eliminated after Round 1 (if round 1 exists and is complete)
  const round1EliminationCount = round1Skipped ? 0 : playoffOpts.round1Eliminations;
  let round1Eliminated: string[] = [];
  if (!round1Skipped && round1Scores.length >= playoffOpts.round1Races && round1Standings.length > 0 && round1EliminationCount > 0) {
    // Bottom N teams after Round 1 are eliminated
    round1Eliminated = round1Standings.slice(-round1EliminationCount).map(s => s.team_id);
    eliminated.push(...round1Eliminated);
  }

  // Calculate Round 2 standings.
  // Only include teams that are LOCKED IN to Round 2: catbird seats always,
  // Round 1 survivors only once Round 1 has actually been completed.
  const round1Complete = !round1Skipped && round1Scores.length >= playoffOpts.round1Races;
  let round2Competitors: string[] = [];
  if (round2Skipped) {
    round2Competitors = [];
  } else if (round1Skipped) {
    // Round 1 skipped - all championship teams compete in round 2 from the start
    round2Competitors = championshipSeeds;
  } else if (round1Complete) {
    // Normal flow, Round 1 done - catbird seats + round 1 survivors
    const round1Survivors = round1Standings.length - round1EliminationCount;
    round2Competitors = [
      ...catbirdSeats,
      ...round1Standings.slice(0, round1Survivors).map(s => s.team_id).filter(id => !round1Eliminated.includes(id)),
    ];
  } else {
    // Round 1 hasn't finished - only the catbird seats are locked in yet
    round2Competitors = [...catbirdSeats];
  }
  const round2Standings = aggregateScores(round2Competitors, round2Scores, regularSeasonStandings);

  // Determine who was eliminated after Round 2 (if round 2 exists and is complete)
  const round2EliminationCount = round2Skipped ? 0 : playoffOpts.round2Eliminations;
  let round2Eliminated: string[] = [];
  if (!round2Skipped && round2Scores.length >= playoffOpts.round2Races && round2Standings.length > 0 && round2EliminationCount > 0) {
    // Bottom N teams after Round 2 are eliminated
    round2Eliminated = round2Standings.slice(-round2EliminationCount).map(s => s.team_id);
    eliminated.push(...round2Eliminated);
  }

  // Calculate Finals standings.
  // Only include teams that are LOCKED IN to the Finals: nothing until the round
  // that feeds Finals has actually completed.
  const round2Complete = !round2Skipped && round2Scores.length >= playoffOpts.round2Races;
  let finalsCompetitors: string[] = [];
  if (finalsSkipped) {
    finalsCompetitors = [];
  } else if (round2Skipped) {
    // Round 2 skipped - survivors from round 1 (or all championship if round 1 also skipped)
    if (round1Skipped) {
      finalsCompetitors = championshipSeeds;
    } else if (round1Complete) {
      const round1Survivors = round1Standings.length - round1EliminationCount;
      finalsCompetitors = round1Standings
        .slice(0, round1Survivors)
        .map(s => s.team_id)
        .filter(id => !round1Eliminated.includes(id));
    } else {
      finalsCompetitors = [];
    }
  } else if (round2Complete) {
    // Normal flow, Round 2 done - survivors from round 2
    const round2Survivors = round2Standings.length - round2EliminationCount;
    finalsCompetitors = round2Standings
      .slice(0, round2Survivors)
      .map(s => s.team_id)
      .filter(id => !round2Eliminated.includes(id));
  } else {
    // Round 2 hasn't finished - no team is locked into Finals yet
    finalsCompetitors = [];
  }
  const finalsStandings = aggregateScores(finalsCompetitors, finalsScores, regularSeasonStandings);

  // Consolation Bracket: seeds 8-15 + eliminated championship teams
  // Cumulative scoring across ALL playoff races
  const allPlayoffScores = [...round1Scores, ...round2Scores, ...finalsScores];
  const consolationTeams = [...consolationSeeds, ...eliminated];
  const consolationStandings = aggregateScores(consolationTeams, allPlayoffScores, regularSeasonStandings);

  // Muddy Mile: seeds 16-17
  // Cumulative scoring across ALL playoff races
  const muddyMileStandings = aggregateScores(muddyMileSeeds, allPlayoffScores, regularSeasonStandings);

  return {
    regularSeasonStandings,
    playoffRound,
    championshipBracket: {
      round1: round1Standings,
      round2: round2Standings,
      finals: finalsStandings,
      eliminated,
      catbirdSeats,
    },
    consolationBracket: consolationStandings,
    muddyMile: muddyMileStandings,
  };
}

/**
 * Checks if the regular season is complete (all regular races have results)
 */
export function isRegularSeasonComplete(
  totalRegularRaces: number,
  completedRegularRaces: number
): boolean {
  return completedRegularRaces >= totalRegularRaces && totalRegularRaces > 0;
}

/**
 * Checks if playoffs have started (at least one playoff race exists with results)
 */
export function havePlayoffsStarted(
  playoffRaceScores: RaceScore[]
): boolean {
  return playoffRaceScores.length > 0;
}
