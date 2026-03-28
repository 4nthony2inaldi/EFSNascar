'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Season } from '@/types';

interface JsonRace {
  race_number: number;
  track: string;
  name: string;
  result_count: number;
}

interface DbRace {
  id: string;
  race_number: number;
  name: string;
  track: string;
  scheduled_datetime: string;
  status: string;
  result_count: number;
  potential_json_matches: JsonRace[];
}

interface RaceData {
  year: number;
  season_id: string;
  races: DbRace[];
  json_races: JsonRace[];
}

export default function FixRaceLinksPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [relinking, setRelinking] = useState<string | null>(null);

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedYear) {
      loadRaceData(selectedYear);
    }
  }, [selectedYear]);

  const loadSeasons = async () => {
    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });

    setSeasons(seasonsData || []);

    // Default to oldest season (most likely to have issues)
    const oldest = seasonsData?.[seasonsData.length - 1];
    if (oldest) {
      setSelectedYear(oldest.year);
    }

    setLoading(false);
  };

  const loadRaceData = async (year: number) => {
    setLoading(true);
    setRaceData(null);

    try {
      const response = await fetch(`/api/admin/fix-race-links?year=${year}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load race data');
      }

      setRaceData(data);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRelink = async (dbRaceId: string, jsonRaceNumber: number) => {
    if (!selectedYear) return;

    const confirmMessage = `Re-import results from JSON race #${jsonRaceNumber} to this database race? This will delete any existing results for this race.`;
    if (!confirm(confirmMessage)) return;

    setRelinking(dbRaceId);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/fix-race-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_race_id: dbRaceId,
          json_race_number: jsonRaceNumber,
          year: selectedYear,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to re-link race');
      }

      setMessage({
        type: 'success',
        text: `Successfully imported ${data.imported} results from "${data.json_race.name}" to "${data.db_race.name}"`,
      });

      // Reload data
      loadRaceData(selectedYear);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setRelinking(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Find duplicates - tracks that appear multiple times in database
  const getDuplicateTracks = () => {
    if (!raceData) return new Set<string>();
    const trackCounts: Record<string, number> = {};
    raceData.races.forEach(r => {
      const normalizedTrack = r.track.toLowerCase();
      trackCounts[normalizedTrack] = (trackCounts[normalizedTrack] || 0) + 1;
    });
    return new Set(
      Object.entries(trackCounts)
        .filter(([, count]) => count > 1)
        .map(([track]) => track)
    );
  };

  const duplicateTracks = getDuplicateTracks();

  if (loading && !raceData) {
    return <div className="text-purple-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Fix Race Results Links</h2>
          <p className="text-purple-400 text-sm">
            Re-link race results when they were imported to the wrong race (e.g., multiple races at same track)
          </p>
        </div>
        <select
          value={selectedYear || ''}
          onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          className="px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.year}>
              {season.year} Season
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Info Box */}
      <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/5">
        <h3 className="text-sm font-bold text-amber-400 mb-2">How to use this tool</h3>
        <ol className="list-decimal list-inside text-purple-200 text-sm space-y-1">
          <li>Look for races at duplicate tracks (highlighted in amber) with incorrect result counts</li>
          <li>Check the "Potential JSON Matches" column to see which JSON races could link here</li>
          <li>Click "Link" next to the correct JSON race to re-import those results</li>
          <li>After fixing, go to Admin → Scoring and recalculate scores for this season</li>
        </ol>
      </div>

      {/* Races Table */}
      {raceData && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-purple-900/30 text-left text-purple-300">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Database Race</th>
                  <th className="px-3 py-3">Track</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Results</th>
                  <th className="px-3 py-3">Potential JSON Matches</th>
                </tr>
              </thead>
              <tbody>
                {raceData.races.map((race) => {
                  const isDuplicateTrack = duplicateTracks.has(race.track.toLowerCase());

                  return (
                    <tr
                      key={race.id}
                      className={`border-b border-purple-800/30 ${
                        isDuplicateTrack ? 'bg-amber-900/10' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-amber-400 font-bold">{race.race_number}</td>
                      <td className="px-3 py-3 text-white">{race.name}</td>
                      <td className={`px-3 py-3 ${isDuplicateTrack ? 'text-amber-400 font-medium' : 'text-purple-300'}`}>
                        {race.track}
                        {isDuplicateTrack && (
                          <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1 rounded">
                            duplicate
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-purple-300">{formatDate(race.scheduled_datetime)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            race.result_count > 0
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {race.result_count} results
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {race.potential_json_matches.length > 0 ? (
                          <div className="space-y-1">
                            {race.potential_json_matches.map((match) => (
                              <div
                                key={match.race_number}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span className="text-purple-300">
                                  #{match.race_number}: {match.name.slice(0, 30)}...
                                  <span className="text-purple-500 ml-1">({match.result_count} results)</span>
                                </span>
                                <button
                                  onClick={() => handleRelink(race.id, match.race_number)}
                                  disabled={relinking === race.id}
                                  className="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {relinking === race.id ? '...' : 'Link'}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-purple-500 text-xs">No matches</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* JSON Races Reference */}
      {raceData && (
        <div className="glass rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">JSON Race Data Reference ({selectedYear})</h3>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-purple-900/80">
                <tr className="text-purple-300">
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Track</th>
                  <th className="px-2 py-1 text-left">Race Name</th>
                  <th className="px-2 py-1 text-right">Results</th>
                </tr>
              </thead>
              <tbody>
                {raceData.json_races.map((jr) => (
                  <tr key={jr.race_number} className="border-b border-purple-800/20">
                    <td className="px-2 py-1 text-amber-400">{jr.race_number}</td>
                    <td className="px-2 py-1 text-purple-300">{jr.track}</td>
                    <td className="px-2 py-1 text-purple-200">{jr.name}</td>
                    <td className="px-2 py-1 text-right text-purple-400">{jr.result_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
