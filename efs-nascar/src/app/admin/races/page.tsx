'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Race, Season, RaceType } from '@/types';

export default function AdminRacesPage() {
  const supabase = createClient();
  const [races, setRaces] = useState<Race[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRace, setEditingRace] = useState<Race | null>(null);
  const [formData, setFormData] = useState({
    race_number: 1,
    name: '',
    track: '',
    scheduled_datetime: '',
    deadline_datetime: '',
    race_type: 'regular' as RaceType,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadRaces(selectedSeason);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const raceData = {
      season_id: selectedSeason,
      race_number: formData.race_number,
      name: formData.name,
      track: formData.track,
      scheduled_datetime: new Date(formData.scheduled_datetime).toISOString(),
      deadline_datetime: new Date(formData.deadline_datetime).toISOString(),
      race_type: formData.race_type,
    };

    if (editingRace) {
      const { error } = await supabase
        .from('races')
        .update(raceData)
        .eq('id', editingRace.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('races').insert(raceData);

      if (error) {
        setError(error.message);
        return;
      }
    }

    setShowForm(false);
    setEditingRace(null);
    resetForm();
    loadRaces(selectedSeason);
  };

  const resetForm = () => {
    const nextRaceNumber = races.length > 0 ? Math.max(...races.map((r) => r.race_number)) + 1 : 1;
    setFormData({
      race_number: nextRaceNumber,
      name: '',
      track: '',
      scheduled_datetime: '',
      deadline_datetime: '',
      race_type: 'regular',
    });
  };

  const handleEdit = (race: Race) => {
    setEditingRace(race);
    setFormData({
      race_number: race.race_number,
      name: race.name,
      track: race.track,
      scheduled_datetime: toDatetimeLocalFormat(race.scheduled_datetime),
      deadline_datetime: toDatetimeLocalFormat(race.deadline_datetime),
      race_type: race.race_type,
    });
    setShowForm(true);
  };

  const handleDelete = async (race: Race) => {
    if (!confirm(`Delete race "${race.name}"? This cannot be undone.`)) return;

    await supabase.from('races').delete().eq('id', race.id);
    loadRaces(selectedSeason);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  // Convert ISO timestamp to datetime-local input format (local time)
  const toDatetimeLocalFormat = (isoString: string) => {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getRaceTypeColor = (type: RaceType) => {
    switch (type) {
      case 'playoff_round1':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'playoff_round2':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'playoff_finals':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'exhibition':
        return 'bg-purple-700/30 text-purple-300 border-purple-600/30';
      default:
        return 'bg-purple-900/30 text-purple-300 border-purple-700/30';
    }
  };

  if (loading) {
    return <div className="text-purple-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Manage Races</h2>
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
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRace(null);
            resetForm();
          }}
          className="px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
        >
          Add Race
        </button>
      </div>

      {/* Race Form */}
      {showForm && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingRace ? 'Edit Race' : 'Add New Race'}
          </h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Race #</label>
                <input
                  type="number"
                  value={formData.race_number}
                  onChange={(e) => setFormData({ ...formData, race_number: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Race Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Daytona 500"
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Track</label>
                <input
                  type="text"
                  value={formData.track}
                  onChange={(e) => setFormData({ ...formData, track: e.target.value })}
                  placeholder="e.g., Daytona International Speedway"
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Race Date/Time</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_datetime}
                  onChange={(e) => setFormData({ ...formData, scheduled_datetime: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Pick Deadline</label>
                <input
                  type="datetime-local"
                  value={formData.deadline_datetime}
                  onChange={(e) => setFormData({ ...formData, deadline_datetime: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Race Type</label>
                <select
                  value={formData.race_type}
                  onChange={(e) => setFormData({ ...formData, race_type: e.target.value as RaceType })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="regular">Regular Season</option>
                  <option value="playoff_round1">Playoff Round 1</option>
                  <option value="playoff_round2">Playoff Round 2</option>
                  <option value="playoff_finals">Playoff Finals</option>
                  <option value="exhibition">Exhibition</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
              >
                {editingRace ? 'Update' : 'Create'} Race
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRace(null);
                }}
                className="px-4 py-2 bg-purple-700/30 text-purple-200 rounded-lg hover:bg-purple-700/50 transition-colors border border-purple-600/30"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Races List */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Race</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Deadline</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {races.map((race) => (
                <tr key={race.id} className="border-b border-purple-800/30">
                  <td className="px-4 py-3 text-amber-400 font-bold">{race.race_number}</td>
                  <td className="px-4 py-3 text-white">{race.name}</td>
                  <td className="px-4 py-3 text-purple-300">{race.track}</td>
                  <td className="px-4 py-3 text-purple-300 text-sm">{formatDateTime(race.scheduled_datetime)}</td>
                  <td className="px-4 py-3 text-purple-300 text-sm">{formatDateTime(race.deadline_datetime)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded border ${getRaceTypeColor(race.race_type)}`}>
                      {race.race_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded border ${
                      race.status === 'final' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      race.status === 'in_progress' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                      'bg-purple-700/30 text-purple-300 border-purple-600/30'
                    }`}>
                      {race.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(race)}
                        className="text-amber-400 hover:text-amber-300 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(race)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {races.length === 0 && (
          <div className="text-center py-8 text-purple-400">
            No races scheduled for this season.
          </div>
        )}
      </div>
    </div>
  );
}
