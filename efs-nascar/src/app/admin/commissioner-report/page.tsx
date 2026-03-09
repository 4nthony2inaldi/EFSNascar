'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeamHighlight {
  teamName: string;
  carNumber: number;
}

interface TopScorer extends TeamHighlight {
  points: number;
  drivers: { name: string; points: number }[];
  bonuses: string[];
}

interface Mover extends TeamHighlight {
  spots: number;
  from: number;
  to: number;
}

interface ReportData {
  race: {
    name: string;
    track: string;
    date: string;
    raceNumber: number;
  };
  highlights: {
    topScorers: TopScorer[];
    biggestMoversUp: Mover[];
    biggestMoversDown: Mover[];
  };
  standings: {
    rank: number;
    movement: number;
    teamId: string;
    teamName: string;
    carNumber: number;
    totalPoints: number;
    raceWins: number;
    stageWins: number;
    weeklyScore: number;
  }[];
  luckyDogPosition: number;
}

export default function CommissionerReportPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<any[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedRaceId, setSelectedRaceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSeasons = async () => {
      const { data } = await supabase
        .from('seasons')
        .select('id, name, year, is_active')
        .order('year', { ascending: false });
      if (data) {
        setSeasons(data);
        const active = data.find((s: any) => s.is_active);
        if (active) setSelectedSeasonId(active.id);
      }
    };
    loadSeasons();
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    const loadRaces = async () => {
      const { data } = await supabase
        .from('races')
        .select('id, race_number, name, track, status')
        .eq('season_id', selectedSeasonId)
        .in('race_type', ['regular', 'playoff_round1', 'playoff_round2', 'playoff_finals'])
        .order('race_number', { ascending: true });
      if (data) {
        setRaces(data);
        // Default to latest final race
        const finalRaces = data.filter((r: any) => r.status === 'final');
        if (finalRaces.length > 0) {
          setSelectedRaceId(finalRaces[finalRaces.length - 1].id);
        }
      }
    };
    loadRaces();
  }, [selectedSeasonId]);

  const generateReport = async () => {
    if (!selectedRaceId || !selectedSeasonId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/admin/commissioner-report?raceId=${selectedRaceId}&seasonId=${selectedSeasonId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2">Commissioner Report</h2>
      <p className="text-purple-400 mb-6">Generate a shareable race recap with highlights and standings</p>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">Season</label>
          <select
            value={selectedSeasonId}
            onChange={(e) => { setSelectedSeasonId(e.target.value); setReport(null); }}
            className="px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">Select season...</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">Race</label>
          <select
            value={selectedRaceId}
            onChange={(e) => { setSelectedRaceId(e.target.value); setReport(null); }}
            className="px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">Select race...</option>
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                Race {r.race_number}: {r.name} {r.status === 'final' ? '(final)' : `(${r.status})`}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={generateReport}
          disabled={loading || !selectedRaceId}
          className="px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 font-bold rounded-lg hover:from-amber-300 hover:to-yellow-300 disabled:opacity-50 transition-all"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Report Card */}
      {report && (
        <div ref={reportRef} className="max-w-[680px] mx-auto bg-[#141414] border border-[#2a2a2a] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] px-6 py-5 border-b-2 border-[#e63946]">
            <h3 className="text-xs uppercase tracking-[2px] text-[#e63946] font-bold mb-1">Commissioner Report</h3>
            <h4 className="text-xl font-bold text-white">
              Race {report.race.raceNumber}: {report.race.name}
            </h4>
            <p className="text-sm text-gray-400 mt-0.5">
              {report.race.track} &bull; {formatDate(report.race.date)}
            </p>
          </div>

          {/* Highlights */}
          <div className="px-6 py-5 border-b border-[#2a2a2a]">
            <h3 className="text-xs uppercase tracking-[1.5px] text-[#e63946] font-bold mb-4">Race Highlights</h3>

            {/* Top Scorer(s) */}
            {report.highlights.topScorers.length > 0 && (
              <div className="flex items-start gap-3 mb-3.5">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#2a2206] flex items-center justify-center text-base">&#127942;</div>
                <div>
                  <div className="text-[10px] uppercase tracking-[1px] text-gray-500 mb-0.5">
                    Top Scorer{report.highlights.topScorers.length > 1 ? 's' : ''} &mdash; {report.highlights.topScorers[0].points} pts
                  </div>
                  {report.highlights.topScorers.map((scorer, i) => (
                    <div key={i} className={i > 0 ? 'mt-1.5' : ''}>
                      <div className="text-sm font-semibold text-white">
                        <CarNum n={scorer.carNumber} />{scorer.teamName}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {scorer.drivers.map((d, j) => (
                          <span key={j}>{j > 0 ? ', ' : ''}{d.name} ({d.points})</span>
                        ))}
                        {scorer.bonuses.length > 0 && (
                          <span> + {scorer.bonuses.join(' + ')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Biggest Movers Up */}
            {report.highlights.biggestMoversUp.length > 0 && (
              <div className="flex items-start gap-3 mb-3.5">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#062a12] flex items-center justify-center text-base">&#9650;</div>
                <div>
                  <div className="text-[10px] uppercase tracking-[1px] text-gray-500 mb-0.5">
                    Biggest Mover{report.highlights.biggestMoversUp.length > 1 ? 's' : ''} Up &mdash; {report.highlights.biggestMoversUp[0].spots} spots
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {report.highlights.biggestMoversUp.map((m, i) => (
                      <div key={i} className={i > 0 ? 'mt-0.5' : ''}>
                        <CarNum n={m.carNumber} />{m.teamName}
                        &nbsp;<span className="text-[#2ecc71]">
                          {getOrdinal(m.from)} &rarr; {getOrdinal(m.to)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Biggest Movers Down */}
            {report.highlights.biggestMoversDown.length > 0 && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#2a0606] flex items-center justify-center text-base">&#9660;</div>
                <div>
                  <div className="text-[10px] uppercase tracking-[1px] text-gray-500 mb-0.5">
                    Biggest Mover{report.highlights.biggestMoversDown.length > 1 ? 's' : ''} Down &mdash; {report.highlights.biggestMoversDown[0].spots} spots
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {report.highlights.biggestMoversDown.map((m, i) => (
                      <div key={i} className={i > 0 ? 'mt-0.5' : ''}>
                        <CarNum n={m.carNumber} />{m.teamName}
                        &nbsp;<span className="text-[#e63946]">
                          {getOrdinal(m.from)} &rarr; {getOrdinal(m.to)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Standings */}
          <div>
            <h3 className="text-xs uppercase tracking-[1.5px] text-[#4ea8de] font-bold px-6 pt-4 pb-3">Updated Standings</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-center border-b border-[#2a2a2a]">Rk</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-center border-b border-[#2a2a2a]">Move</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-left border-b border-[#2a2a2a]">Team</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-right border-b border-[#2a2a2a]">Pts</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-center border-b border-[#2a2a2a]">W</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-center border-b border-[#2a2a2a]">Stg</th>
                  <th className="text-[10px] uppercase tracking-[0.5px] text-gray-500 px-3 py-2 text-right border-b border-[#2a2a2a]">This Week</th>
                </tr>
              </thead>
              <tbody>
                {report.standings.map((s, idx) => (
                  <>
                    {/* Lucky Dog divider — after position 6, before position 7 (Lucky Dog) */}
                    {idx === report!.luckyDogPosition - 1 && (
                      <tr key="lucky-dog">
                        <td colSpan={7} className="px-3 py-1">
                          <div className="flex items-center gap-2.5 text-[#e6a23c] text-[10px] uppercase tracking-[2px] font-bold">
                            <div className="flex-1 h-px" style={{ background: 'repeating-linear-gradient(90deg, #e6a23c 0, #e6a23c 4px, transparent 4px, transparent 8px)' }} />
                            Lucky Dog
                            <div className="flex-1 h-px" style={{ background: 'repeating-linear-gradient(90deg, #e6a23c 0, #e6a23c 4px, transparent 4px, transparent 8px)' }} />
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr key={s.teamId} className="hover:bg-[#1a1a1a]">
                      <td className="px-3 py-2.5 text-center font-bold text-white text-sm">{s.rank}</td>
                      <td className="px-3 py-2.5 text-center text-xs font-semibold">
                        {s.movement > 0 ? (
                          <span className="text-[#2ecc71]">&#9650; {s.movement}</span>
                        ) : s.movement < 0 ? (
                          <span className="text-[#e63946]">&#9660; {Math.abs(s.movement)}</span>
                        ) : (
                          <span className="text-gray-600">&mdash;</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-white whitespace-nowrap">
                        <CarNum n={s.carNumber} />{s.teamName}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-sm text-white">{s.totalPoints}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-300">{s.raceWins}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-300">{s.stageWins}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-sm text-[#f0c040]">+{s.weeklyScore}</td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 text-center text-[11px] text-gray-600 border-t border-[#2a2a2a]">
            EFS NASCAR &bull; Commissioner Eyes Only
          </div>
        </div>
      )}
    </div>
  );
}

function CarNum({ n, sm }: { n: number; sm?: boolean }) {
  return (
    <span
      className={`inline-block bg-[#e63946] text-white font-bold rounded mr-1 min-w-[22px] text-center ${
        sm ? 'text-[9px] px-1 py-px' : 'text-[10px] px-1.5 py-px'
      }`}
    >
      {n}
    </span>
  );
}
