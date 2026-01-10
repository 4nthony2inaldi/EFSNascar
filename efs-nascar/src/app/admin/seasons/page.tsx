'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Season } from '@/types';

export default function AdminSeasonsPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    name: '',
    start_date: '',
    end_date: '',
    is_active: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSeasons();
  }, []);

  const loadSeasons = async () => {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });

    if (error) {
      console.error('Error loading seasons:', error);
    } else {
      setSeasons(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const seasonData = {
      year: formData.year,
      name: formData.name || `${formData.year} Season`,
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      is_active: formData.is_active,
    };

    // If setting as active, deactivate other seasons first
    if (formData.is_active) {
      await supabase
        .from('seasons')
        .update({ is_active: false })
        .neq('id', editingSeason?.id || '');
    }

    if (editingSeason) {
      const { error } = await supabase
        .from('seasons')
        .update(seasonData)
        .eq('id', editingSeason.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('seasons')
        .insert(seasonData);

      if (error) {
        setError(error.message);
        return;
      }
    }

    setShowForm(false);
    setEditingSeason(null);
    setFormData({
      year: new Date().getFullYear(),
      name: '',
      start_date: '',
      end_date: '',
      is_active: false,
    });
    loadSeasons();
  };

  const handleEdit = (season: Season) => {
    setEditingSeason(season);
    setFormData({
      year: season.year,
      name: season.name,
      start_date: season.start_date,
      end_date: season.end_date || '',
      is_active: season.is_active,
    });
    setShowForm(true);
  };

  const handleSetActive = async (season: Season) => {
    await supabase
      .from('seasons')
      .update({ is_active: false })
      .neq('id', season.id);

    await supabase
      .from('seasons')
      .update({ is_active: true })
      .eq('id', season.id);

    loadSeasons();
  };

  if (loading) {
    return <div className="text-purple-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Manage Seasons</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingSeason(null);
            setFormData({
              year: new Date().getFullYear(),
              name: '',
              start_date: '',
              end_date: '',
              is_active: false,
            });
          }}
          className="px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
        >
          Add Season
        </button>
      </div>

      {/* Season Form */}
      {showForm && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingSeason ? 'Edit Season' : 'Add New Season'}
          </h3>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Year</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={`${formData.year} Season`}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">End Date</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="mr-2 accent-amber-400"
              />
              <label htmlFor="is_active" className="text-purple-200">Set as active season</label>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
              >
                {editingSeason ? 'Update' : 'Create'} Season
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingSeason(null);
                }}
                className="px-4 py-2 bg-purple-700/30 text-purple-200 rounded-lg hover:bg-purple-700/50 transition-colors border border-purple-600/30"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Seasons List */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Start Date</th>
              <th className="px-4 py-3">End Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) => (
              <tr key={season.id} className="border-b border-purple-800/30">
                <td className="px-4 py-3 text-white font-bold">{season.year}</td>
                <td className="px-4 py-3 text-white">{season.name}</td>
                <td className="px-4 py-3 text-purple-300">{season.start_date}</td>
                <td className="px-4 py-3 text-purple-300">{season.end_date || '-'}</td>
                <td className="px-4 py-3">
                  {season.is_active ? (
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/30">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-purple-700/30 text-purple-300 text-xs rounded border border-purple-600/30">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(season)}
                      className="text-amber-400 hover:text-amber-300 text-sm"
                    >
                      Edit
                    </button>
                    {!season.is_active && (
                      <button
                        onClick={() => handleSetActive(season)}
                        className="text-emerald-400 hover:text-emerald-300 text-sm"
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {seasons.length === 0 && (
          <div className="text-center py-8 text-purple-400">
            No seasons created yet.
          </div>
        )}
      </div>
    </div>
  );
}
