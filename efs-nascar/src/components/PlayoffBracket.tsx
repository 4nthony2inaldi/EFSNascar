'use client';

import Link from 'next/link';
import type { PlayoffStandings, PlayoffTeamStanding } from '@/lib/playoff-standings';

interface PlayoffBracketProps {
  playoffStandings: PlayoffStandings;
  regularSeasonStandings: any[];
  userTeamId?: string;
  playoffOpts: {
    championshipBracketSize: number;
    catbirdSeats: number;
    round1Races: number;
    round2Races: number;
    finalsRaces: number;
    round1Eliminations: number;
    round2Eliminations: number;
  };
  completedPlayoffRaces: number;
  totalPlayoffRaces: number;
}

interface TeamCardProps {
  team: PlayoffTeamStanding | null;
  points?: number | string;
  isUserTeam: boolean;
  isEliminated: boolean;
  isCatbird: boolean;
  isLuckyDog: boolean;
  isChampion: boolean;
  showBye?: boolean;
  seed?: number;
}

function TeamCard({
  team,
  points,
  isUserTeam,
  isEliminated,
  isCatbird,
  isLuckyDog,
  isChampion,
  showBye,
  seed,
}: TeamCardProps) {
  if (!team) return null;

  const bgColor = isEliminated
    ? 'bg-red-500/20 border-red-500/40'
    : isChampion
    ? 'bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border-amber-400'
    : isCatbird
    ? 'bg-amber-500/10 border-amber-500/40'
    : isUserTeam
    ? 'bg-purple-500/20 border-purple-400'
    : 'bg-purple-900/30 border-purple-700/50';

  return (
    <div
      className={`rounded-lg border p-2 sm:p-3 ${bgColor} ${
        isEliminated ? 'opacity-60' : ''
      }`}
    >
      <Link
        href={`/teams/${team.team_id}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <span
          className={`font-bold text-lg w-8 text-center ${
            isCatbird
              ? 'text-amber-400'
              : isEliminated
              ? 'text-red-400'
              : 'text-amber-400'
          }`}
        >
          {team.team?.car_number}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={`font-medium truncate ${
                isEliminated ? 'text-red-300' : 'text-white'
              }`}
            >
              {team.team?.name}
            </span>
            {isUserTeam && (
              <span className="text-[10px] bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 px-1.5 py-0.5 rounded font-bold">
                YOU
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs mt-0.5">
            {showBye ? (
              <span className="text-amber-400">BYE</span>
            ) : (
              <span className={isEliminated ? 'text-red-300' : 'text-purple-300'}>
                {points} pts
              </span>
            )}
            {isCatbird && !showBye && (
              <span className="text-amber-400">Catbird</span>
            )}
            {isLuckyDog && (
              <span className="text-amber-400">Lucky Dog</span>
            )}
            {isEliminated && (
              <span className="text-red-400 font-medium">OUT</span>
            )}
            {isChampion && (
              <span className="text-amber-400 font-medium">CHAMPION</span>
            )}
          </div>
        </div>
        {seed && (
          <span className="text-purple-500 text-xs">#{seed}</span>
        )}
      </Link>
    </div>
  );
}

export function PlayoffBracket({
  playoffStandings,
  regularSeasonStandings,
  userTeamId,
  playoffOpts,
  completedPlayoffRaces,
  totalPlayoffRaces,
}: PlayoffBracketProps) {
  const { championshipBracket, playoffRound } = playoffStandings;
  const { catbirdSeats, round1, round2, finals, eliminated } = championshipBracket;

  // Helper to get team info
  const getTeamFromId = (teamId: string): PlayoffTeamStanding | null => {
    const found = regularSeasonStandings.find((s) => s.team_id === teamId);
    if (!found) return null;
    return {
      team_id: found.team_id,
      team: found.team,
      total_points: found.total_points,
      race_wins: found.race_wins,
      stage_wins: found.stage_wins,
      top_10_bonuses: found.top_10_bonuses,
      rank: found.rank,
    };
  };

  // Get seed position (1-indexed)
  const getSeed = (teamId: string): number => {
    const idx = regularSeasonStandings.findIndex((s) => s.team_id === teamId);
    return idx >= 0 ? idx + 1 : 0;
  };

  // Check team status
  const isEliminated = (teamId: string) => eliminated.includes(teamId);
  const isCatbird = (teamId: string) => catbirdSeats.includes(teamId);
  const isLuckyDog = (teamId: string) => getSeed(teamId) === playoffOpts.championshipBracketSize;

  // Determine which rounds to show
  const showRound1 = playoffOpts.round1Races > 0;
  const showRound2 = playoffOpts.round2Races > 0;
  const showFinals = playoffOpts.finalsRaces > 0;

  // Round 1: Seeds 3-7 compete (catbird seats have bye)
  const round1TeamIds = regularSeasonStandings
    .slice(playoffOpts.catbirdSeats, playoffOpts.championshipBracketSize)
    .map((s) => s.team_id);

  // Get points for a team in a specific round's standings
  const getPointsInRound = (
    teamId: string,
    roundStandings: PlayoffTeamStanding[]
  ): number => {
    const found = roundStandings.find((s) => s.team_id === teamId);
    return found?.total_points || 0;
  };

  // Determine round 1 eliminated teams
  const round1EliminatedTeams = round1.length > 0 && playoffRound !== 'round1'
    ? round1.slice(-playoffOpts.round1Eliminations).map((s) => s.team_id)
    : [];

  // Determine round 2 eliminated teams
  const round2EliminatedTeams = round2.length > 0 && (playoffRound === 'finals' || playoffRound === 'complete')
    ? round2.slice(-playoffOpts.round2Eliminations).map((s) => s.team_id)
    : [];

  // Helper to get label for round status
  const getRoundStatus = (round: 'round1' | 'round2' | 'finals') => {
    if (round === 'round1') {
      if (playoffRound === 'round1') return 'In Progress';
      if (round1.length > 0) return 'Complete';
      return 'Upcoming';
    }
    if (round === 'round2') {
      if (playoffRound === 'round2') return 'In Progress';
      if (round2.length > 0 && playoffRound !== 'round1') return 'Complete';
      return 'Upcoming';
    }
    if (round === 'finals') {
      if (playoffRound === 'finals') return 'In Progress';
      if (playoffRound === 'complete') return 'Complete';
      return 'Upcoming';
    }
    return '';
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 px-4 py-3 border-b border-amber-500/30">
        <h3 className="text-lg font-bold text-amber-400">Championship Bracket</h3>
        <p className="text-sm text-purple-300">
          Top {playoffOpts.championshipBracketSize} teams competing for the championship
          {' '}&bull; {completedPlayoffRaces} of {totalPlayoffRaces} playoff races
        </p>
      </div>

      {/* Playoffs Not Started */}
      {playoffRound === 'not_started' && (
        <div className="p-6 text-center text-purple-400">
          <p className="mb-4">Playoffs begin after the regular season.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
            {catbirdSeats.map((teamId) => {
              const team = getTeamFromId(teamId);
              return team ? (
                <TeamCard
                  key={teamId}
                  team={team}
                  isUserTeam={teamId === userTeamId}
                  isEliminated={false}
                  isCatbird={true}
                  isLuckyDog={false}
                  isChampion={false}
                  showBye={true}
                  seed={getSeed(teamId)}
                />
              ) : null;
            })}
          </div>
          <p className="text-sm text-purple-500 mt-4">
            Catbird seats (top 2 seeds) will have a first round bye
          </p>
        </div>
      )}

      {/* Bracket Display */}
      {playoffRound !== 'not_started' && (
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-4 min-w-[800px]">
            {/* Round 1 Column */}
            {showRound1 && (
              <div className="flex-1 min-w-[220px]">
                <div className="text-center mb-3">
                  <h4 className="text-sm font-bold text-white">Round 1</h4>
                  <p className="text-xs text-purple-400">{getRoundStatus('round1')}</p>
                </div>

                {/* Catbird Seats with BYE */}
                <div className="space-y-2 mb-4">
                  {catbirdSeats.map((teamId) => {
                    const team = getTeamFromId(teamId);
                    return (
                      <TeamCard
                        key={teamId}
                        team={team}
                        isUserTeam={teamId === userTeamId}
                        isEliminated={false}
                        isCatbird={true}
                        isLuckyDog={false}
                        isChampion={false}
                        showBye={true}
                        seed={getSeed(teamId)}
                      />
                    );
                  })}
                </div>

                {/* Divider */}
                <div className="border-t border-purple-700/50 my-3" />

                {/* Round 1 Competitors */}
                <div className="space-y-2">
                  {round1.length > 0
                    ? round1.map((standing) => (
                        <TeamCard
                          key={standing.team_id}
                          team={standing}
                          points={standing.total_points}
                          isUserTeam={standing.team_id === userTeamId}
                          isEliminated={round1EliminatedTeams.includes(standing.team_id)}
                          isCatbird={false}
                          isLuckyDog={isLuckyDog(standing.team_id)}
                          isChampion={false}
                          seed={getSeed(standing.team_id)}
                        />
                      ))
                    : round1TeamIds.map((teamId) => {
                        const team = getTeamFromId(teamId);
                        return (
                          <TeamCard
                            key={teamId}
                            team={team}
                            points={0}
                            isUserTeam={teamId === userTeamId}
                            isEliminated={false}
                            isCatbird={false}
                            isLuckyDog={isLuckyDog(teamId)}
                            isChampion={false}
                            seed={getSeed(teamId)}
                          />
                        );
                      })}
                </div>
              </div>
            )}

            {/* Arrow */}
            {showRound1 && showRound2 && (
              <div className="flex items-center text-purple-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}

            {/* Round 2 Column */}
            {showRound2 && (
              <div className="flex-1 min-w-[220px]">
                <div className="text-center mb-3">
                  <h4 className="text-sm font-bold text-white">Round 2</h4>
                  <p className="text-xs text-purple-400">{getRoundStatus('round2')}</p>
                </div>

                <div className="space-y-2">
                  {round2.length > 0
                    ? round2.map((standing) => (
                        <TeamCard
                          key={standing.team_id}
                          team={standing}
                          points={standing.total_points}
                          isUserTeam={standing.team_id === userTeamId}
                          isEliminated={round2EliminatedTeams.includes(standing.team_id)}
                          isCatbird={isCatbird(standing.team_id)}
                          isLuckyDog={isLuckyDog(standing.team_id)}
                          isChampion={false}
                          seed={getSeed(standing.team_id)}
                        />
                      ))
                    : (
                      <div className="text-center text-purple-500 text-sm py-8">
                        Awaiting Round 1 results...
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Arrow */}
            {showRound2 && showFinals && (
              <div className="flex items-center text-purple-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}

            {/* Finals Column */}
            {showFinals && (
              <div className="flex-1 min-w-[220px]">
                <div className="text-center mb-3">
                  <h4 className="text-sm font-bold text-white">Championship</h4>
                  <p className="text-xs text-purple-400">{getRoundStatus('finals')}</p>
                </div>

                <div className="space-y-2">
                  {finals.length > 0
                    ? finals.map((standing, idx) => (
                        <TeamCard
                          key={standing.team_id}
                          team={standing}
                          points={standing.total_points}
                          isUserTeam={standing.team_id === userTeamId}
                          isEliminated={false}
                          isCatbird={isCatbird(standing.team_id)}
                          isLuckyDog={false}
                          isChampion={playoffRound === 'complete' && idx === 0}
                          seed={getSeed(standing.team_id)}
                        />
                      ))
                    : (
                      <div className="text-center text-purple-500 text-sm py-8">
                        Awaiting Round 2 results...
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Champion Trophy */}
            {playoffRound === 'complete' && finals.length > 0 && (
              <>
                <div className="flex items-center text-amber-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[120px]">
                  <div className="text-6xl mb-2">🏆</div>
                  <div className="text-center">
                    <div className="text-amber-400 font-bold text-lg">
                      #{finals[0]?.team?.car_number}
                    </div>
                    <div className="text-white font-medium text-sm">
                      {finals[0]?.team?.name}
                    </div>
                    <div className="text-amber-400 text-xs mt-1">
                      CHAMPION
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="px-4 py-3 border-t border-purple-700/30 bg-purple-900/20">
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50"></div>
            <span className="text-purple-300">Catbird Seat</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/30 border border-red-500/50"></div>
            <span className="text-purple-300">Eliminated</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500/30 border border-purple-400"></div>
            <span className="text-purple-300">Your Team</span>
          </div>
        </div>
      </div>
    </div>
  );
}
