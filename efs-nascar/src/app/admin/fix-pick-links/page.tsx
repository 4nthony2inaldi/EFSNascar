'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Season } from '@/types';

interface Pick {
  id: string;
  team: { id: string; name: string };
  driver_1: { id: string; name: string };
  driver_2: { id: string; name: string };
  driver_3: { id: string; name: string };
}

interface DuplicateTrackRace {
  id: string;
  race_number: number;
  name: string;
  scheduled_datetime: string;
  pick_count: number;
}

interface RaceWithPicks {
  id: string;
  race_number: number;
  name: string;
  track: string;
  scheduled_datetime: string;
  race_type: string;
  pick_count: number;
  picks: Pick[];
  duplicate_track_races: DuplicateTrackRace[];
}

interface RaceData {
  year: number;
  season_id: string;
  races: RaceWithPicks[];
  total_picks: number;
}

export default function FixPickLinksPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [expandedRace, setExpandedRace] = useState<string | null>(null);
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(new Set());

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
    setExpandedRace(null);
    setSelectedPicks(new Set());

    try {
      const response = await fetch(`/api/admin/fix-pick-links?year=${year}`);
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

  const handleMoveAllPicks = async (sourceRaceId: string, targetRaceId: string, targetRaceName: string) => {
    if (!selectedYear) return;

    const confirmMessage = `Move ALL picks from this race to "${targetRaceName}"?`;
    if (!confirm(confirmMessage)) return;

    setMoving(sourceRaceId);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/fix-pick-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_race_id: sourceRaceId,
          target_race_id: targetRaceId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move picks');
      }

      setMessage({
        type: 'success',
        text: `Successfully moved ${data.moved} picks from "${data.source_race.name}" to "${data.target_race.name}"`,
      });

      // Reload data
      loadRaceData(selectedYear);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setMoving(null);
    }
  };

  const handleMoveSelectedPicks = async (sourceRaceId: string, targetRaceId: string, targetRaceName: string) => {
    if (!selectedYear || selectedPicks.size === 0) return;

    const confirmMessage = `Move ${selectedPicks.size} selected pick(s) to "${targetRaceName}"?`;
    if (!confirm(confirmMessage)) return;

    setMoving(sourceRaceId);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/fix-pick-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_race_id: sourceRaceId,
          target_race_id: targetRaceId,
          pick_ids: Array.from(selectedPicks),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move picks');
      }

      setMessage({
        type: 'success',
        text: `Successfully moved ${data.moved} picks to "${data.target_race.name}"`,
      });

      // Clear selection and reload
      setSelectedPicks(new Set());
      loadRaceData(selectedYear);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setMoving(null);
    }
  };

  const togglePickSelection = (pickId: string) => {
    setSelectedPicks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pickId)) {
        newSet.delete(pickId);
      } else {
        newSet.add(pickId);
      }
      return newSet;
    });
  };

  const toggleAllPicks = (raceId: string, picks: Pick[]) => {
    const racePickIds = picks.map(p => p.id);
    const allSelected = racePickIds.every(id => selectedPicks.has(id));

    setSelectedPicks(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        racePickIds.forEach(id => newSet.delete(id));
      } else {
        racePickIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Find races at duplicate tracks that have picks
  const getDuplicateTrackRacesWithPicks = () => {
    if (!raceData) return [];
    return raceData.races.filter(r => r.duplicate_track_races.length > 0 && r.pick_count > 0);
  };

  const duplicateRaces = getDuplicateTrackRacesWithPicks();

  if (loading && !raceData) {
    return <div className="text-purple-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Fix Pick Links</h2>
          <p className="text-purple-400 text-sm">
            Re-link picks when they were imported to the wrong race (e.g., multiple races at same track)
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
          <li>Look for races at duplicate tracks (highlighted in amber) with picks that may be incorrectly linked</li>
          <li>Click on a race row to expand and see all picks for that race</li>
          <li>Use "Move All" to move all picks to another race at the same track</li>
          <li>Or select specific picks with checkboxes and use "Move Selected"</li>
        </ol>
      </div>

      {/* Summary Stats */}
      {raceData && (
        <div className="glass rounded-xl p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">{raceData.total_picks}</div>
              <div className="text-purple-400 text-sm">Total Picks</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">{duplicateRaces.length}</div>
              <div className="text-purple-400 text-sm">Races at Duplicate Tracks (with picks)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{raceData.races.filter(r => r.pick_count > 0).length}</div>
              <div className="text-purple-400 text-sm">Races with Picks</div>
            </div>
          </div>
        </div>
      )}

      {/* Races with Duplicate Tracks Section */}
      {duplicateRaces.length > 0 && (
        <div className="glass rounded-xl p-4 border border-amber-500/30">
          <h3 className="text-lg font-bold text-amber-400 mb-4">Races at Duplicate Tracks (Needs Review)</h3>
          <div className="space-y-2">
            {duplicateRaces.map((race) => (
              <div key={race.id} className="bg-amber-900/10 rounded-lg border border-amber-700/30">
                {/* Race Header */}
                <div
                  className="px-4 py-3 cursor-pointer hover:bg-amber-900/20 transition-colors"
                  onClick={() => setExpandedRace(expandedRace === race.id ? null : race.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-amber-400 font-bold">#{race.race_number}</span>
                      <span className="text-white font-medium">{race.name}</span>
                      <span className="text-purple-400">{race.track}</span>
                      <span className="text-purple-500 text-sm">{formatDate(race.scheduled_datetime)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-sm">
                        {race.pick_count} picks
                      </span>
                      <span className="text-purple-400">
                        {expandedRace === race.id ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {/* Other races at same track */}
                  <div className="mt-2 text-sm text-purple-400">
                    Also at this track:{' '}
                    {race.duplicate_track_races.map((other, idx) => (
                      <span key={other.id}>
                        {idx > 0 && ', '}
                        <span className="text-purple-300">
                          #{other.race_number} ({other.pick_count} picks, {formatDate(other.scheduled_datetime)})
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded Picks List */}
                {expandedRace === race.id && (
                  <div className="px-4 pb-4 border-t border-amber-700/30">
                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 py-3 border-b border-purple-800/30 mb-3">
                      <span className="text-purple-400 text-sm">Move picks to:</span>
                      {race.duplicate_track_races.map((target) => (
                        <div key={target.id} className="flex gap-1">
                          <button
                            onClick={() => handleMoveAllPicks(race.id, target.id, target.name)}
                            disabled={moving === race.id}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {moving === race.id ? '...' : `Move All → #${target.race_number}`}
                          </button>
                          {selectedPicks.size > 0 && (
                            <button
                              onClick={() => handleMoveSelectedPicks(race.id, target.id, target.name)}
                              disabled={moving === race.id}
                              className="px-3 py-1 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Move {selectedPicks.size} Selected → #{target.race_number}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Picks Table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-purple-400">
                          <th className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={race.picks.length > 0 && race.picks.every(p => selectedPicks.has(p.id))}
                              onChange={() => toggleAllPicks(race.id, race.picks)}
                              className="accent-amber-400"
                            />
                          </th>
                          <th className="px-2 py-1">Team</th>
                          <th className="px-2 py-1">Driver 1</th>
                          <th className="px-2 py-1">Driver 2</th>
                          <th className="px-2 py-1">Driver 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {race.picks.map((pick) => (
                          <tr
                            key={pick.id}
                            className={`border-b border-purple-800/20 ${
                              selectedPicks.has(pick.id) ? 'bg-amber-900/20' : ''
                            }`}
                          >
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={selectedPicks.has(pick.id)}
                                onChange={() => togglePickSelection(pick.id)}
                                className="accent-amber-400"
                              />
                            </td>
                            <td className="px-2 py-2 text-white font-medium">{pick.team.name}</td>
                            <td className="px-2 py-2 text-purple-200">{pick.driver_1.name}</td>
                            <td className="px-2 py-2 text-purple-200">{pick.driver_2.name}</td>
                            <td className="px-2 py-2 text-purple-200">{pick.driver_3.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Races Table */}
      {raceData && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-purple-800/30">
            <h3 className="text-lg font-bold text-white">All Races ({selectedYear})</h3>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-purple-900/80">
                <tr className="text-left text-purple-300">
                  <th className="px-3 py-3">#</th>
                  <th className="px-3 py-3">Race</th>
                  <th className="px-3 py-3">Track</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Picks</th>
                  <th className="px-3 py-3">Same Track Races</th>
                </tr>
              </thead>
              <tbody>
                {raceData.races.map((race) => {
                  const hasDuplicateTrack = race.duplicate_track_races.length > 0;

                  return (
                    <tr
                      key={race.id}
                      className={`border-b border-purple-800/30 ${
                        hasDuplicateTrack ? 'bg-amber-900/10' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-amber-400 font-bold">{race.race_number}</td>
                      <td className="px-3 py-3 text-white">{race.name}</td>
                      <td className={`px-3 py-3 ${hasDuplicateTrack ? 'text-amber-400 font-medium' : 'text-purple-300'}`}>
                        {race.track}
                        {hasDuplicateTrack && (
                          <span className="ml-2 text-xs bg-amber-500/20 text-amber-400 px-1 rounded">
                            duplicate
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-purple-300">{formatDate(race.scheduled_datetime)}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          race.race_type === 'regular'
                            ? 'bg-purple-700/30 text-purple-300'
                            : race.race_type === 'exhibition'
                            ? 'bg-gray-700/30 text-gray-300'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {race.race_type}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            race.pick_count > 0
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-purple-700/20 text-purple-400'
                          }`}
                        >
                          {race.pick_count}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-purple-400 text-xs">
                        {race.duplicate_track_races.length > 0
                          ? race.duplicate_track_races.map(r => `#${r.race_number}`).join(', ')
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
