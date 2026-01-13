// Playoff standings calculation utilities
import type { RaceType } from '@/types/database';

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
 */
export function getPlayoffRound(
  completedPlayoffRaces: { race_type: RaceType }[]
): PlayoffStandings['playoffRound'] {
  const round1Races = completedPlayoffRaces.filter(r => r.race_type === 'playoff_round1').length;
  const round2Races = completedPlayoffRaces.filter(r => r.race_type === 'playoff_round2').length;
  const finalsRaces = completedPlayoffRaces.filter(r => r.race_type === 'playoff_finals').length;

  if (finalsRaces >= 2) return 'complete';
  if (finalsRaces > 0 || round2Races >= 2) return 'finals';
  if (round2Races > 0 || round1Races >= 1) return 'round2';
  if (round1Races > 0) return 'round1';

  return 'not_started';
}

/**
 * Calculates playoff standings from race scores
 */
export function calculatePlayoffStandings(
  regularSeasonStandings: PlayoffTeamStanding[],
  playoffRaceScores: RaceScore[]
): PlayoffStandings {
  // Separate scores by playoff round
  const round1Scores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_round1');
  const round2Scores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_round2');
  const finalsScores = playoffRaceScores.filter(s => s.race.race_type === 'playoff_finals');

  const playoffRound = getPlayoffRound([
    ...round1Scores.map(s => s.race),
    ...round2Scores.map(s => s.race),
    ...finalsScores.map(s => s.race),
  ]);

  // Get team IDs by their regular season seed
  const catbirdSeats = regularSeasonStandings.slice(0, 2).map(s => s.team_id);
  const championshipSeeds = regularSeasonStandings.slice(0, 7).map(s => s.team_id);
  const consolationSeeds = regularSeasonStandings.slice(7, 15).map(s => s.team_id);
  const muddyMileSeeds = regularSeasonStandings.slice(15, 17).map(s => s.team_id);

  const eliminated: string[] = [];

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

      // Check for race win (any driver with 10 points = P1)
      if (score.driver_1_points === 10 || score.driver_2_points === 10 || score.driver_3_points === 10) {
        teamTotals[score.team_id].race_wins += 1;
      }
    }

    return Object.values(teamTotals)
      .sort((a, b) => b.total_points - a.total_points)
      .map((team, index) => ({
        ...team,
        rank: index + 1,
      }));
  };

  // Calculate Round 1 standings (seeds 3-7 compete, seeds 1-2 have bye)
  const round1Competitors = championshipSeeds.slice(2, 7); // Seeds 3-7
  const round1Standings = aggregateScores(round1Competitors, round1Scores, regularSeasonStandings);

  // Determine who was eliminated after Round 1 (if round 1 is complete)
  let round1Eliminated: string[] = [];
  if (round1Scores.length >= 1 && round1Standings.length > 0) {
    // Bottom team after Round 1 is eliminated
    round1Eliminated = [round1Standings[round1Standings.length - 1].team_id];
    eliminated.push(...round1Eliminated);
  }

  // Calculate Round 2 standings (6 teams: catbird seats + 4 survivors from round 1)
  const round2Competitors = [
    ...catbirdSeats,
    ...round1Standings.slice(0, 4).map(s => s.team_id).filter(id => !round1Eliminated.includes(id)),
  ].slice(0, 6);
  const round2Standings = aggregateScores(round2Competitors, round2Scores, regularSeasonStandings);

  // Determine who was eliminated after Round 2 (if round 2 is complete)
  let round2Eliminated: string[] = [];
  if (round2Scores.length >= 2 && round2Standings.length > 0) {
    // Bottom 2 teams after Round 2 are eliminated
    round2Eliminated = round2Standings.slice(-2).map(s => s.team_id);
    eliminated.push(...round2Eliminated);
  }

  // Calculate Finals standings (4 teams: survivors from round 2)
  const finalsCompetitors = round2Standings
    .slice(0, 4)
    .map(s => s.team_id)
    .filter(id => !round2Eliminated.includes(id));
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
