export default function RulesPage() {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      {/* Header - hidden on mobile */}
      <div className="hidden sm:block">
        <h1 className="text-3xl font-bold text-white">League Rules</h1>
        <p className="text-purple-400 mt-1">EFS NASCAR Fantasy League Official Rulebook</p>
      </div>

      {/* Quick Overview */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-4">
          Quick Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">17</div>
            <div className="text-purple-300 text-sm">Teams</div>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">3</div>
            <div className="text-purple-300 text-sm">Drivers Per Week</div>
          </div>
          <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-700/30">
            <div className="text-3xl font-bold text-amber-400">4+1</div>
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
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Position Points (Top 10 Finishes)</h3>
            <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
              {[
                { pos: '1st', pts: 10 },
                { pos: '2nd', pts: 9 },
                { pos: '3rd', pts: 8 },
                { pos: '4th', pts: 7 },
                { pos: '5th', pts: 6 },
                { pos: '6th', pts: 5 },
                { pos: '7th', pts: 4 },
                { pos: '8th', pts: 3 },
                { pos: '9th', pts: 2 },
                { pos: '10th', pts: 1 },
              ].map((item) => (
                <div key={item.pos} className="bg-purple-900/30 rounded-lg p-2 text-center border border-purple-700/30">
                  <div className="text-amber-400 font-bold">{item.pts}</div>
                  <div className="text-purple-400 text-xs">{item.pos}</div>
                </div>
              ))}
            </div>
            <p className="text-purple-400 text-sm mt-2">11th place and below = 0 points</p>
          </div>

          {/* Bonus Points */}
          <div>
            <h3 className="text-lg font-semibold text-purple-200 mb-3">Bonus Points</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                <span className="text-purple-200">Stage Win (by any of your 3 drivers)</span>
                <span className="text-amber-400 font-bold">+1 point</span>
              </div>
              <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                <span className="text-purple-200">Most Laps Led (by any of your 3 drivers)</span>
                <span className="text-amber-400 font-bold">+1 point</span>
              </div>
              <div className="flex items-center justify-between bg-purple-900/20 rounded-lg p-3 border border-purple-700/20">
                <span className="text-purple-200">All 3 Drivers Finish Top 10</span>
                <span className="text-amber-400 font-bold">+1 point</span>
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
                <p className="text-white font-medium">Base Usage: 4 times per driver per season</p>
                <p className="text-purple-400 text-sm">Each driver can be picked a maximum of 4 times during the season</p>
              </div>
            </div>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">Bonus 5th Use: 1 additional use on ANY driver</p>
                <p className="text-purple-400 text-sm">Every team starts with 1 bonus 5th use they can apply to any single driver</p>
              </div>
            </div>
          </div>

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
              <li>• Win the Consolation Bracket: +1 bonus use next season</li>
              <li>• Win Bottom 2 Battle: +1 bonus use next season</li>
              <li>• Lose Bottom 2 Battle: Forfeit 5th use (only 4 uses per driver next season)</li>
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
            <p className="text-purple-300 text-sm">Starts with the Daytona 500 and runs through approximately 22 races. Pick 3 drivers each week and accumulate points.</p>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">All-Star Exhibition (Mid-Season)</h3>
            <ul className="text-purple-300 text-sm space-y-1">
              <li>• Async draft format - 1 driver per team</li>
              <li>• Reverse standings draft order</li>
              <li>• Scoring: 3/2/1 points for 1st/2nd/3rd place picks</li>
              <li>• No driver usages burned</li>
              <li>• Result serves as 5th tiebreaker</li>
            </ul>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">Fantasy Playoffs (Final 5 Races)</h3>
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
        <div className="mb-6 bg-amber-900/20 rounded-lg p-4 border border-amber-700/20">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-2 flex items-center">
            🐱 Catbird Seats (Top 2 Teams)
          </h3>
          <p className="text-purple-300 text-sm">The top 2 teams at the end of the regular season earn the coveted &quot;Catbird Seats&quot; - a first round bye in the playoffs. They don&apos;t pick drivers in Round 1 and automatically advance to Round 2 with 0 points.</p>
        </div>

        {/* Championship Bracket */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300 mb-3">Championship Bracket (Top 7 Teams)</h3>
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
                <tr className="border-b border-purple-800/30">
                  <td className="py-3 text-blue-400 font-medium">Round 1</td>
                  <td className="py-3 text-center">1</td>
                  <td className="py-3 text-center">7</td>
                  <td className="py-3">1 eliminated</td>
                  <td className="py-3 text-purple-400 text-xs">🐱 Catbird Seats (1-2) get bye</td>
                </tr>
                <tr className="border-b border-purple-800/30">
                  <td className="py-3 text-purple-400 font-medium">Round 2</td>
                  <td className="py-3 text-center">2</td>
                  <td className="py-3 text-center">6</td>
                  <td className="py-3">2 eliminated</td>
                  <td className="py-3 text-purple-400 text-xs">Points reset</td>
                </tr>
                <tr>
                  <td className="py-3 text-amber-400 font-medium">Finals</td>
                  <td className="py-3 text-center">2</td>
                  <td className="py-3 text-center">4</td>
                  <td className="py-3">Crown champion</td>
                  <td className="py-3 text-purple-400 text-xs">Points reset</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Consolation Bracket */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-purple-200 mb-3">Consolation Bracket (Teams 8-15)</h3>
          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <ul className="text-purple-300 text-sm space-y-2">
              <li>• Teams ranked 8-15 at start of playoffs</li>
              <li>• Eliminated championship teams join (keep their playoff points)</li>
              <li>• Cumulative scoring across all 5 weeks (no resets)</li>
              <li className="text-emerald-400">• Winner earns +1 bonus driver usage for next season</li>
            </ul>
          </div>
        </div>

        {/* Bottom 2 - Muddy Mile */}
        <div>
          <h3 className="text-lg font-semibold text-red-400 mb-3 flex items-center">
            💩 The Muddy Mile (Teams 16-17)
          </h3>
          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/20">
            <p className="text-purple-300 text-sm mb-3">The bottom 2 teams trudge through the &quot;Muddy Mile&quot; - a 5-week battle to avoid last place and its harsh penalty.</p>
            <ul className="text-purple-300 text-sm space-y-2">
              <li>• Teams ranked 16th and 17th compete</li>
              <li>• Cumulative scoring across all 5 playoff weeks</li>
              <li className="text-emerald-400">• Winner: Escapes the mud with +1 bonus usage next season</li>
              <li className="text-red-400">• Loser: Stuck in the mud - forfeits 5th usage (only 4 uses per driver next season)</li>
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
            <h3 className="text-emerald-400 font-semibold mb-2">Top 6 Spots</h3>
            <p className="text-purple-300 text-sm">Awarded to the 6 teams with the most points at the end of the regular season</p>
          </div>

          <div className="bg-amber-900/20 rounded-lg p-4 border border-amber-700/20">
            <h3 className="text-amber-400 font-semibold mb-2">7th Spot - &quot;Lucky Dog&quot;</h3>
            <p className="text-purple-300 text-sm">Awarded to the team (outside top 6) with the most race winners picked during the regular season</p>
          </div>

          <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/20">
            <h3 className="text-purple-200 font-semibold mb-2">Tiebreakers (in order)</h3>
            <ol className="text-purple-300 text-sm space-y-1 list-decimal list-inside">
              <li>Most race winners picked</li>
              <li>Most stage winners picked</li>
              <li>Most &quot;all 3 in top 10&quot; bonuses</li>
              <li>Head-to-head record</li>
              <li>All-Star race finish position</li>
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
              <li>Picks are revealed to everyone once deadline passes OR all 17 teams submit</li>
            </ol>
          </div>

          <div className="bg-red-900/20 rounded-lg p-4 border border-red-700/20">
            <h3 className="text-red-400 font-semibold mb-2">Missed Deadline</h3>
            <ul className="text-purple-300 text-sm space-y-1">
              <li>• Team receives 0 points for the week</li>
              <li>• No driver usages are burned</li>
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
