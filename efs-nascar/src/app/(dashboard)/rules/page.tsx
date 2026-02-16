import { createClient } from '@/lib/supabase/server';
import type { ScoringConfig } from '@/types';
import { DEFAULT_SCORING_CONFIG, getPlayoffConfig } from '@/lib/scoring-config';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const TIEBREAKER_LABELS: Record<string, string> = {
  race_wins: 'Most race winners picked',
  stage_wins: 'Most stage winners picked',
  laps_led: 'Most laps led bonus earned',
  top_10_bonuses: 'Most "all 3 in top 10" bonuses',
  allstar_position: 'All-Star race finish position',
};

export default async function RulesPage() {
  const supabase = await createClient();

  // Get active season and its scoring config
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name, year')
    .eq('is_active', true)
    .single();

  let config: ScoringConfig | null = null;
  if (activeSeason) {
    const { data: scoringConfig } = await supabase
      .from('scoring_configs')
      .select('*')
      .eq('season_id', activeSeason.id)
      .single();
    config = scoringConfig as ScoringConfig | null;
  }

  // Get team count
  const { count: teamCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true });

  const numTeams = teamCount || 17;

  // Extract values from config with defaults
  const positionPoints = config?.position_points || DEFAULT_SCORING_CONFIG.position_points;
  const stage1Bonus = config?.stage_1_bonus ?? DEFAULT_SCORING_CONFIG.stage_1_bonus;
  const stage2Bonus = config?.stage_2_bonus ?? DEFAULT_SCORING_CONFIG.stage_2_bonus;
  const stage3Bonus = config?.stage_3_bonus ?? DEFAULT_SCORING_CONFIG.stage_3_bonus;
  const lapsLedBonus = config?.laps_led_bonus ?? DEFAULT_SCORING_CONFIG.laps_led_bonus;
  const top10Bonus = config?.top_10_all_drivers_bonus ?? DEFAULT_SCORING_CONFIG.top_10_all_drivers_bonus;
  const baseDriverUses = config?.base_driver_uses ?? DEFAULT_SCORING_CONFIG.base_driver_uses;
  const bonusUses = config?.bonus_uses_per_season ?? DEFAULT_SCORING_CONFIG.bonus_uses_per_season;
  const regularSeasonRaces = config?.regular_season_races ?? DEFAULT_SCORING_CONFIG.regular_season_races;
  const tiebreakerOrder = config?.tiebreaker_order || DEFAULT_SCORING_CONFIG.tiebreaker_order;

  const playoff = getPlayoffConfig(config);
  const totalPlayoffRaces = playoff.round1Races + playoff.round2Races + playoff.finalsRaces;

  // Build sorted position points array
  const posPoints = Object.entries(positionPoints)
    .map(([pos, pts]) => ({ pos: parseInt(pos, 10), pts: pts as number }))
    .filter(p => p.pts > 0)
    .sort((a, b) => a.pos - b.pos);

  const maxScoringPos = posPoints.length > 0 ? posPoints[posPoints.length - 1].pos : 10;

  // Determine stage bonus display
  const allStagesSame = stage1Bonus === stage2Bonus && stage2Bonus === stage3Bonus;

  // Championship bracket teams entering round 2 after catbird bye
  const round1Competitors = playoff.championshipBracketSize - playoff.catbirdSeats;
  const round2Teams = round1Competitors - playoff.round1Eliminations + playoff.catbirdSeats;
  const finalsTeams = round2Teams - playoff.round2Eliminations;

  // Lucky dog spot = championship bracket size - (top spots by points)
  const topSpotsByPoints = playoff.championshipBracketSize - 1;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      {/* Header - hidden on mobile */}
      <div className="hidden sm:block">
        <h1 className="text-3xl font-bold text-white">League Rules</h1>
        <p className="text-purple-400 mt-1">
          EFS NASCAR Fantasy League Official Rulebook
          {activeSeason && <span className="text-purple-500"> &mdash; {activeSeason.year} Season</span>}
        </p>
      </div>

      {/* Quick Overview */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-4">
          Quick Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">{numTeams}</div>
            <div className="text-purple-300 text-sm">Teams</div>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">3</div>
            <div className="text-purple-300 text-sm">Drivers Per Week</div>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">{baseDriverUses}{bonusUses > 0 ? `+${bonusUses}` : ''}</div>
            <div className="text-purple-300 text-sm">Uses Per Driver</div>
          </div>
        </div>
      </div>

      {/* Scoring System */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">1</span>
          Scoring System
        </h2>

        <div className="space-y-6">
          {/* Position Points */}
          <div>
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Position Points (Top {maxScoringPos} Finishes)</h3>
            <div className={`grid gap-2 ${posPoints.length <= 10 ? 'grid-cols-5 md:grid-cols-10' : 'grid-cols-5 md:grid-cols-8 lg:grid-cols-10'}`}>
              {posPoints.map((item) => (
                <div key={item.pos} className="bg-purple-900/30 rounded-lg p-2 text-center border border-purple-700/30">
                  <div className="text-amber-400 font-bold">{item.pts}</div>
                  <div className="text-purple-400 text-xs">{ordinal(item.pos)}</div>
                </div>
              ))}
            </div>
            <p className="text-purple-400 text-sm mt-2">{ordinal(maxScoringPos + 1)} place and below = 0 points</p>
          </div>

          {/* Bonus Points */}
          <div>
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Bonus Points</h3>
            <div className="space-y-2">
              {allStagesSame ? (
                <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                  <span className="text-purple-200">Stage Win (by any of your 3 drivers)</span>
                  <span className="text-amber-400 font-bold">+{stage1Bonus} point{stage1Bonus !== 1 ? 's' : ''}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                    <span className="text-purple-200">Stage 1 Win (by any of your 3 drivers)</span>
                    <span className="text-amber-400 font-bold">+{stage1Bonus} point{stage1Bonus !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                    <span className="text-purple-200">Stage 2 Win (by any of your 3 drivers)</span>
                    <span className="text-amber-400 font-bold">+{stage2Bonus} point{stage2Bonus !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                    <span className="text-purple-200">Stage 3 Win (by any of your 3 drivers)</span>
                    <span className="text-amber-400 font-bold">+{stage3Bonus} point{stage3Bonus !== 1 ? 's' : ''}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                <span className="text-purple-200">Most Laps Led (by any of your 3 drivers)</span>
                <span className="text-amber-400 font-bold">+{lapsLedBonus} point{lapsLedBonus !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                <span className="text-purple-200">All 3 Drivers Finish Top 10</span>
                <span className="text-amber-400 font-bold">+{top10Bonus} point{top10Bonus !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Driver Usage */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">2</span>
          Driver Usage Rules
        </h2>

        <div className="space-y-4">
          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Base Usage: {baseDriverUses} times per driver per season</p>
                <p className="text-purple-400 text-sm">Each driver can be picked a maximum of {baseDriverUses} times during the season</p>
              </div>
            </div>
          </div>

          {bonusUses > 0 && (
            <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium">Bonus {ordinal(baseDriverUses + 1)} Use: {bonusUses} additional use on ANY driver</p>
                  <p className="text-purple-400 text-sm">Every team starts with {bonusUses} bonus {ordinal(baseDriverUses + 1)} use they can apply to any single driver</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/20">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Maxed Out Driver = 0 Points</p>
                <p className="text-purple-400 text-sm">Picking a driver who has reached their usage limit results in 0 points for that slot (usage is NOT burned)</p>
              </div>
            </div>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h4 className="text-white font-medium mb-2">Earning Extra Bonus Uses</h4>
            <ul className="text-purple-300 text-sm space-y-1">
              <li>&bull; Win the Consolation Bracket: +1 bonus use next season</li>
              <li>&bull; Win Bottom 2 Battle: +1 bonus use next season</li>
              <li>&bull; Lose Bottom 2 Battle: Forfeit {ordinal(baseDriverUses + 1)} use (only {baseDriverUses} uses per driver next season)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Season Structure */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">3</span>
          Season Structure
        </h2>

        <div className="space-y-4">
          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">Regular Season</h3>
            <p className="text-purple-300 text-sm">Starts with the Daytona 500 and runs through {regularSeasonRaces} races. Pick 3 drivers each week and accumulate points.</p>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">All-Star Exhibition (Mid-Season)</h3>
            <ul className="text-purple-300 text-sm space-y-1">
              <li>&bull; Async draft format - 1 driver per team</li>
              <li>&bull; Reverse standings draft order</li>
              <li>&bull; Scoring: 3/2/1 points for 1st/2nd/3rd place picks</li>
              <li>&bull; No driver usages burned</li>
              <li>&bull; Result serves as final tiebreaker</li>
            </ul>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">Fantasy Playoffs (Final {totalPlayoffRaces} Races)</h3>
            <p className="text-purple-300 text-sm mb-3">Season ends at the August Daytona race (Coke Zero Sugar 400)</p>
          </div>
        </div>
      </div>

      {/* Playoffs */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">4</span>
          Playoff Structure
        </h2>

        {/* Catbird Seats */}
        {playoff.catbirdSeats > 0 && (
          <div className="mb-6 bg-amber-900/20 rounded-lg p-4 border border-amber-700/20">
            <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-2 flex items-center">
              Catbird Seats (Top {playoff.catbirdSeats} Teams)
            </h3>
            <p className="text-purple-300 text-sm">The top {playoff.catbirdSeats} teams at the end of the regular season earn the coveted &quot;Catbird Seats&quot; - a first round bye in the playoffs. They don&apos;t pick drivers in Round 1 and automatically advance to Round 2 with 0 points.</p>
          </div>
        )}

        {/* Championship Bracket */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-3">Championship Bracket (Top {playoff.championshipBracketSize} Teams)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-purple-700/30">
                  <th className="text-left py-2 text-purple-400">Round</th>
                  <th className="text-center py-2 text-purple-400">Races</th>
                  <th className="text-center py-2 text-purple-400">Teams</th>
                  <th className="text-left py-2 text-purple-400">Elimination</th>
                  <th className="text-left py-2 text-purple-400">Notes</th>
                </tr>
              </thead>
              <tbody className="text-purple-200">
                {playoff.round1Races > 0 && (
                  <tr className="border-b border-purple-800/30">
                    <td className="py-3 text-blue-400 font-medium">Round 1</td>
                    <td className="py-3 text-center">{playoff.round1Races}</td>
                    <td className="py-3 text-center">{playoff.championshipBracketSize}</td>
                    <td className="py-3">{playoff.round1Eliminations} eliminated</td>
                    <td className="py-3 text-purple-400 text-xs">{playoff.catbirdSeats > 0 ? `Catbird Seats (1-${playoff.catbirdSeats}) get bye` : ''}</td>
                  </tr>
                )}
                <tr className="border-b border-purple-800/30">
                  <td className="py-3 text-purple-400 font-medium">Round 2</td>
                  <td className="py-3 text-center">{playoff.round2Races}</td>
                  <td className="py-3 text-center">{round2Teams}</td>
                  <td className="py-3">{playoff.round2Eliminations} eliminated</td>
                  <td className="py-3 text-purple-400 text-xs">Points reset</td>
                </tr>
                <tr>
                  <td className="py-3 text-amber-400 font-medium">Finals</td>
                  <td className="py-3 text-center">{playoff.finalsRaces}</td>
                  <td className="py-3 text-center">{finalsTeams}</td>
                  <td className="py-3">Crown champion</td>
                  <td className="py-3 text-purple-400 text-xs">Points reset</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Consolation Bracket */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-purple-200 mb-3">Consolation Bracket (Teams {playoff.consolationStart}-{playoff.consolationEnd})</h3>
          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <ul className="text-purple-300 text-sm space-y-2">
              <li>&bull; Teams ranked {playoff.consolationStart}-{playoff.consolationEnd} at start of playoffs</li>
              <li>&bull; Eliminated championship teams join (keep their playoff points)</li>
              <li>&bull; Cumulative scoring across all {totalPlayoffRaces} weeks (no resets)</li>
              <li className="text-emerald-400">&bull; Winner earns +1 bonus driver usage for next season</li>
            </ul>
          </div>
        </div>

        {/* Bottom 2 - Muddy Mile */}
        <div>
          <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center">
            The Muddy Mile (Teams {playoff.muddyMileStart}-{playoff.muddyMileEnd})
          </h3>
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/20">
            <p className="text-purple-300 text-sm mb-3">The bottom {playoff.muddyMileEnd - playoff.muddyMileStart + 1} teams trudge through the &quot;Muddy Mile&quot; - a {totalPlayoffRaces}-week battle to avoid last place and its harsh penalty.</p>
            <ul className="text-purple-300 text-sm space-y-2">
              <li>&bull; Teams ranked {ordinal(playoff.muddyMileStart)} and {ordinal(playoff.muddyMileEnd)} compete</li>
              <li>&bull; Cumulative scoring across all {totalPlayoffRaces} playoff weeks</li>
              <li className="text-emerald-400">&bull; Winner: Escapes the mud with +1 bonus usage next season</li>
              <li className="text-red-400">&bull; Loser: Stuck in the mud - forfeits {ordinal(baseDriverUses + 1)} usage (only {baseDriverUses} uses per driver next season)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Playoff Qualification */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">5</span>
          Playoff Qualification
        </h2>

        <div className="space-y-4">
          <div className="bg-emerald-900/20 rounded-lg p-4 border border-emerald-700/20">
            <h3 className="text-emerald-400 font-semibold mb-2">Top {topSpotsByPoints} Spots</h3>
            <p className="text-purple-300 text-sm">Awarded to the {topSpotsByPoints} teams with the most points at the end of the regular season</p>
          </div>

          <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">{ordinal(playoff.championshipBracketSize)} Spot - &quot;Lucky Dog&quot;</h3>
            <p className="text-purple-300 text-sm">Awarded to the team (outside top {topSpotsByPoints}) with the most race winners picked during the regular season</p>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-purple-200 font-semibold mb-2">Tiebreakers (in order)</h3>
            <ol className="text-purple-300 text-sm space-y-1 list-decimal list-inside">
              {tiebreakerOrder.map((key) => (
                <li key={key}>{TIEBREAKER_LABELS[key] || key}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Pick Submission */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center">
          <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm font-bold mr-3">6</span>
          Pick Submission Rules
        </h2>

        <div className="space-y-4">
          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-purple-200 font-semibold mb-2">Weekly Process</h3>
            <ol className="text-purple-300 text-sm space-y-2 list-decimal list-inside">
              <li>Check the race schedule and deadline (typically noon on race day)</li>
              <li>Select 3 different drivers</li>
              <li>System validates your picks against usage limits</li>
              <li>Submit before the deadline</li>
              <li>Picks are revealed to everyone once deadline passes OR all {numTeams} teams submit</li>
            </ol>
          </div>

          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/20">
            <h3 className="text-red-400 font-semibold mb-2">Missed Deadline</h3>
            <ul className="text-purple-300 text-sm space-y-1">
              <li>&bull; Team receives 0 points for the week</li>
              <li>&bull; No driver usages are burned</li>
            </ul>
          </div>

          <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">Pick Overlap Display</h3>
            <p className="text-purple-300 text-sm">After picks are revealed, they are color-coded to show overlap:</p>
            <div className="flex items-center space-x-4 mt-2">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                <span className="text-purple-300 text-xs">Unique pick</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-amber-500 rounded"></div>
                <span className="text-purple-300 text-xs">Some overlap</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-purple-300 text-xs">High overlap</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-purple-500 text-sm pb-8">
        Questions about the rules? Contact a commissioner for clarification.
      </div>
    </div>
  );
}
