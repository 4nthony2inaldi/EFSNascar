'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Driver, ChampionshipPrediction } from '@/types';

interface ChampionshipPickProps {
  teamId: string;
  seasonId: string;
  revealed: boolean;
  initialPrediction: ChampionshipPrediction | null;
  initialDriver: Driver | null;
}

export function ChampionshipPick({
  teamId,
  seasonId,
  revealed,
  initialPrediction,
  initialDriver,
}: ChampionshipPickProps) {
  const supabase = createClient();

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(
    initialPrediction?.driver_id || null
  );
  const [savedDriver, setSavedDriver] = useState<Driver | null>(initialDriver);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(!initialPrediction);

  useEffect(() => {
    async function loadDrivers() {
      setLoading(true);
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('car_number', { ascending: true });
      setDrivers(data || []);
      setLoading(false);
    }

    if (!revealed && isEditing) {
      loadDrivers();
    }
  }, [revealed, isEditing]);

  const handleSave = async () => {
    if (!selectedDriverId) {
      setError('Please select a driver');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Upsert the prediction
      const { error: upsertError } = await supabase
        .from('championship_predictions')
        .upsert({
          team_id: teamId,
          season_id: seasonId,
          driver_id: selectedDriverId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'team_id,season_id',
        });

      if (upsertError) throw upsertError;

      // Update local state with selected driver
      const selectedDriver = drivers.find(d => d.id === selectedDriverId) || null;
      setSavedDriver(selectedDriver);
      setSuccess(true);
      setIsEditing(false);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving prediction:', err);
      setError(err.message || 'Failed to save prediction');
    } finally {
      setSaving(false);
    }
  };

  // If picks are revealed, show the saved pick (or indicate none made)
  if (revealed) {
    return (
      <div className="glass rounded-xl p-4 sm:p-6 border border-amber-500/30">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🏆</span>
          <h3 className="text-lg font-bold text-amber-400">Championship Pick</h3>
          <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">Revealed</span>
        </div>
        {savedDriver ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center border border-purple-500/30">
              <span className="text-amber-400 font-bold">#{savedDriver.car_number}</span>
            </div>
            <div>
              <p className="text-white font-medium">{savedDriver.name}</p>
              {savedDriver.team_name && (
                <p className="text-xs text-purple-400">{savedDriver.team_name}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-purple-400 text-sm">No prediction submitted</p>
        )}
      </div>
    );
  }

  // If pick is saved and not editing, show the pick with edit option
  if (savedDriver && !isEditing) {
    return (
      <div className="glass rounded-xl p-4 sm:p-6 border border-purple-700/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <h3 className="text-lg font-bold text-white">Championship Pick</h3>
            <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">Hidden</span>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-amber-400 hover:text-amber-300"
          >
            Change
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600/30 rounded-full flex items-center justify-center border border-purple-500/30">
            <span className="text-amber-400 font-bold">#{savedDriver.car_number}</span>
          </div>
          <div>
            <p className="text-white font-medium">{savedDriver.name}</p>
            {savedDriver.team_name && (
              <p className="text-xs text-purple-400">{savedDriver.team_name}</p>
            )}
          </div>
        </div>
        {success && (
          <div className="mt-3 text-sm text-green-400">Prediction saved!</div>
        )}
      </div>
    );
  }

  // Show selection form
  return (
    <div className="glass rounded-xl p-4 sm:p-6 border border-amber-500/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🏆</span>
        <h3 className="text-lg font-bold text-white">Championship Pick</h3>
      </div>
      <p className="text-sm text-purple-300 mb-4">
        Pick which driver you think will win the real NASCAR Cup Championship.
        If correct, your team earns 5 bonus points next season!
      </p>

      {loading ? (
        <div className="text-purple-400">Loading drivers...</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-purple-400 mb-2">Select Driver</label>
            <select
              value={selectedDriverId || ''}
              onChange={(e) => {
                setSelectedDriverId(e.target.value || null);
                setError(null);
              }}
              className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
            >
              <option value="">-- Select a driver --</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  #{driver.car_number} - {driver.name} {driver.team_name ? `(${driver.team_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-400">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !selectedDriverId}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25 transition-all"
            >
              {saving ? 'Saving...' : 'Save Prediction'}
            </button>
            {savedDriver && (
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSelectedDriverId(savedDriver.id);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-purple-400 border border-purple-600/50 hover:border-purple-500"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
