'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Race, Season } from '@/types';

export default function AdminSchedulePage() {
  const supabase = createClient();
  const [races, setRaces] = useState<Race[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedRaces, setSelectedRaces] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadRaces(selectedSeason);
      setSelectedRaces(new Set());
    }
  }, [selectedSeason]);

  const loadData = async () => {
    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });

    setSeasons(seasonsData || []);

    const activeSeason = seasonsData?.find((s) => s.is_active);
    if (activeSeason) {
      setSelectedSeason(activeSeason.id);
    } else if (seasonsData?.length) {
      setSelectedSeason(seasonsData[0].id);
    }

    setLoading(false);
  };

  const loadRaces = async (seasonId: string) => {
    const { data } = await supabase
      .from('races')
      .select('*')
      .eq('season_id', seasonId)
      .order('race_number', { ascending: true });

    setRaces(data || []);
  };

  // Find Daytona races to identify season boundaries
  const getDaytonaIndices = () => {
    const daytonaIndices: number[] = [];
    races.forEach((race, index) => {
      if (race.track.toLowerCase().includes('daytona')) {
        daytonaIndices.push(index);
      }
    });
    return daytonaIndices;
  };

  const daytonaIndices = getDaytonaIndices();
  const firstDaytonaIndex = daytonaIndices.length > 0 ? daytonaIndices[0] : -1;
  const secondDaytonaIndex = daytonaIndices.length > 1 ? daytonaIndices[1] : -1;

  const isOutsideSeason = (index: number) => {
    if (firstDaytonaIndex === -1) return false;
    if (index < firstDaytonaIndex) return true;
    if (secondDaytonaIndex !== -1 && index > secondDaytonaIndex) return true;
    return false;
  };

  const toggleRaceSelection = (raceId: string) => {
    const newSelection = new Set(selectedRaces);
    if (newSelection.has(raceId)) {
      newSelection.delete(raceId);
    } else {
      newSelection.add(raceId);
    }
    setSelectedRaces(newSelection);
  };

  const selectAllOutside = () => {
    const outsideRaces = races
      .filter((_, index) => isOutsideSeason(index))
      .map((r) => r.id);
    setSelectedRaces(new Set(outsideRaces));
  };

  const selectAll = () => {
    setSelectedRaces(new Set(races.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedRaces(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedRaces.size === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedRaces.size} race(s)? This will also delete any associated results and picks. This cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    setDeleting(true);
    setMessage(null);

    try {
      // Delete race results first (foreign key constraint)
      const { error: resultsError } = await supabase
        .from('race_results')
        .delete()
        .in('race_id', Array.from(selectedRaces));

      if (resultsError) {
        throw new Error(`Failed to delete results: ${resultsError.message}`);
      }

      // Delete picks for these races
      const { error: picksError } = await supabase
        .from('picks')
        .delete()
        .in('race_id', Array.from(selectedRaces));

      if (picksError) {
        throw new Error(`Failed to delete picks: ${picksError.message}`);
      }

      // Delete the races
      const { error: racesError } = await supabase
        .from('races')
        .delete()
        .in('id', Array.from(selectedRaces));

      if (racesError) {
        throw new Error(`Failed to delete races: ${racesError.message}`);
      }

      setMessage({ type: 'success', text: `Successfully deleted ${selectedRaces.size} race(s)` });
      setSelectedRaces(new Set());
      loadRaces(selectedSeason);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'An error occurred' });
    } finally {
      setDeleting(false);
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

  if (loading) {
    return <div className="text-purple-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Schedule Management</h2>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} {season.is_active && '(Active)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info Box */}
      <div className="glass rounded-xl p-4 border border-purple-700/30">
        <p className="text-purple-200 text-sm">
          Use this page to trim races from a season's schedule. Races{' '}
          <span className="text-red-400 font-medium">highlighted in red</span> are outside the main
          NASCAR season (before the first Daytona race or after the second Daytona race).
          Daytona races are <span className="text-amber-400 font-medium">highlighted in amber</span>.
        </p>
      </div>

      {/* Selection Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={selectAllOutside}
          className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
        >
          Select Outside Season
        </button>
        <button
          onClick={selectAll}
          className="px-3 py-1.5 text-sm bg-purple-700/30 text-purple-200 rounded-lg hover:bg-purple-700/50 transition-colors border border-purple-600/30"
        >
          Select All
        </button>
        <button
          onClick={clearSelection}
          className="px-3 py-1.5 text-sm bg-purple-700/30 text-purple-200 rounded-lg hover:bg-purple-700/50 transition-colors border border-purple-600/30"
        >
          Clear Selection
        </button>
        <div className="flex-1" />
        {selectedRaces.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-purple-300 text-sm">{selectedRaces.size} race(s) selected</span>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {deleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        )}
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

      {/* Season Summary */}
      {races.length > 0 && (
        <div className="glass rounded-xl p-4 border border-purple-700/30">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-purple-400">Total Races:</span>{' '}
              <span className="text-white font-medium">{races.length}</span>
            </div>
            <div>
              <span className="text-purple-400">First Daytona:</span>{' '}
              <span className="text-white font-medium">
                {firstDaytonaIndex !== -1 ? `Race #${races[firstDaytonaIndex].race_number}` : 'Not found'}
              </span>
            </div>
            <div>
              <span className="text-purple-400">Second Daytona:</span>{' '}
              <span className="text-white font-medium">
                {secondDaytonaIndex !== -1 ? `Race #${races[secondDaytonaIndex].race_number}` : 'Not found'}
              </span>
            </div>
            <div>
              <span className="text-purple-400">Races Outside Season:</span>{' '}
              <span className="text-red-400 font-medium">
                {races.filter((_, index) => isOutsideSeason(index)).length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Races List */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={selectedRaces.size === races.length && races.length > 0}
                    onChange={() => {
                      if (selectedRaces.size === races.length) {
                        clearSelection();
                      } else {
                        selectAll();
                      }
                    }}
                    className="rounded border-purple-600 bg-purple-900/50 text-amber-500 focus:ring-purple-500"
                  />
                </th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Race</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {races.map((race, index) => {
                const isDaytona = race.track.toLowerCase().includes('daytona');
                const outside = isOutsideSeason(index);

                return (
                  <tr
                    key={race.id}
                    className={`border-b border-purple-800/30 ${
                      outside
                        ? 'bg-red-900/20'
                        : isDaytona
                        ? 'bg-amber-900/20'
                        : ''
                    } ${selectedRaces.has(race.id) ? 'bg-purple-700/30' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRaces.has(race.id)}
                        onChange={() => toggleRaceSelection(race.id)}
                        className="rounded border-purple-600 bg-purple-900/50 text-amber-500 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-amber-400 font-bold">{race.race_number}</td>
                    <td className="px-4 py-3 text-white">{race.name}</td>
                    <td className={`px-4 py-3 ${isDaytona ? 'text-amber-400 font-medium' : 'text-purple-300'}`}>
                      {race.track}
                    </td>
                    <td className="px-4 py-3 text-purple-300 text-sm">{formatDate(race.scheduled_datetime)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded border ${
                          race.race_type === 'exhibition'
                            ? 'bg-purple-700/30 text-purple-300 border-purple-600/30'
                            : race.race_type.includes('playoff')
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-purple-900/30 text-purple-300 border-purple-700/30'
                        }`}
                      >
                        {race.race_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded border ${
                          race.status === 'final'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : race.status === 'in_progress'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-purple-700/30 text-purple-300 border-purple-600/30'
                        }`}
                      >
                        {race.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {races.length === 0 && (
          <div className="text-center py-8 text-purple-400">No races found for this season.</div>
        )}
      </div>
    </div>
  );
}
