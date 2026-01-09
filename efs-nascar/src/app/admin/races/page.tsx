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
      scheduled_datetime: formData.scheduled_datetime,
      deadline_datetime: formData.deadline_datetime,
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
      scheduled_datetime: race.scheduled_datetime.slice(0, 16),
      deadline_datetime: race.deadline_datetime.slice(0, 16),
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

  const getRaceTypeColor = (type: RaceType) => {
    switch (type) {
      case 'playoff_round1':
        return 'bg-blue-500';
      case 'playoff_round2':
        return 'bg-purple-500';
      case 'playoff_finals':
        return 'bg-yellow-500';
      case 'exhibition':
        return 'bg-gray-500';
      default:
        return 'bg-gray-700';
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Manage Races</h2>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
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
          className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
        >
          Add Race
        </button>
      </div>

      {/* Race Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingRace ? 'Edit Race' : 'Add New Race'}
          </h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Race #</label>
                <input
                  type="number"
                  value={formData.race_number}
                  onChange={(e) => setFormData({ ...formData, race_number: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Race Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Daytona 500"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Track</label>
                <input
                  type="text"
                  value={formData.track}
                  onChange={(e) => setFormData({ ...formData, track: e.target.value })}
                  placeholder="e.g., Daytona International Speedway"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Race Date/Time</label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_datetime}
                  onChange={(e) => setFormData({ ...formData, scheduled_datetime: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Pick Deadline</label>
                <input
                  type="datetime-local"
                  value={formData.deadline_datetime}
                  onChange={(e) => setFormData({ ...formData, deadline_datetime: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Race Type</label>
                <select
                  value={formData.race_type}
                  onChange={(e) => setFormData({ ...formData, race_type: e.target.value as RaceType })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
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
                className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 transition-colors"
              >
                {editingRace ? 'Update' : 'Create'} Race
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRace(null);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Races List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-left text-gray-400 text-sm">
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
                <tr key={race.id} className="border-b border-gray-700">
                  <td className="px-4 py-3 text-yellow-500 font-bold">{race.race_number}</td>
                  <td className="px-4 py-3 text-white">{race.name}</td>
                  <td className="px-4 py-3 text-gray-400">{race.track}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{formatDateTime(race.scheduled_datetime)}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{formatDateTime(race.deadline_datetime)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 ${getRaceTypeColor(race.race_type)} text-white text-xs rounded`}>
                      {race.race_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded ${
                      race.status === 'final' ? 'bg-green-500/20 text-green-500' :
                      race.status === 'in_progress' ? 'bg-red-500/20 text-red-500' :
                      'bg-gray-600 text-gray-300'
                    }`}>
                      {race.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(race)}
                        className="text-yellow-500 hover:text-yellow-400 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(race)}
                        className="text-red-500 hover:text-red-400 text-sm"
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
          <div className="text-center py-8 text-gray-400">
            No races scheduled for this season.
          </div>
        )}
      </div>
    </div>
  );
}
