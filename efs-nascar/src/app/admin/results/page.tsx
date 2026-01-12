'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Race, Driver, RaceResult } from '@/types';

interface ResultEntry {
  driver_id: string;
  finish_position: number;
  stage_1_winner: boolean;
  stage_2_winner: boolean;
  laps_led: number;
  most_laps_led: boolean;
}

interface ApiImportResult {
  success: boolean;
  message: string;
  raceInfo?: {
    name: string;
    track: string;
    resultsCount: number;
    stage1Winner?: { name: string; carNumber: number } | null;
    stage2Winner?: { name: string; carNumber: number } | null;
    mostLapsLed?: { name: string; carNumber: number; lapsLed: number } | null;
  };
  warnings?: {
    unmatchedDrivers: string[];
    message: string;
  };
}

export default function AdminResultsPage() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [races, setRaces] = useState<Race[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [existingResults, setExistingResults] = useState<RaceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fetchingFromApi, setFetchingFromApi] = useState(false);
  const [apiResult, setApiResult] = useState<ApiImportResult | null>(null);
  const [seasonYear, setSeasonYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedRace) {
      loadExistingResults(selectedRace.id);
    }
  }, [selectedRace]);

  const loadData = async () => {
    // Get active season
    const { data: season } = await supabase
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .single();

    if (!season) {
      setLoading(false);
      return;
    }

    // Set season year for API calls
    setSeasonYear(season.year);

    // Get all races for the season
    const { data: racesData } = await supabase
      .from('races')
      .select('*')
      .eq('season_id', season.id)
      .order('race_number', { ascending: true });

    setRaces(racesData || []);

    // Get all active drivers
    const { data: driversData } = await supabase
      .from('drivers')
      .select('*')
      .eq('is_active', true)
      .order('car_number', { ascending: true });

    setDrivers(driversData || []);

    // Select race from URL param or first race needing results
    const raceIdParam = searchParams.get('race');
    let targetRace = racesData?.find((r) => r.id === raceIdParam);

    if (!targetRace) {
      // Find first race that needs results (past scheduled time but not final)
      const now = new Date().toISOString();
      targetRace = racesData?.find((r) => r.status !== 'final' && r.scheduled_datetime < now);
    }

    if (targetRace) {
      setSelectedRace(targetRace);
    }

    setLoading(false);
  };

  const loadExistingResults = async (raceId: string) => {
    const { data } = await supabase
      .from('race_results')
      .select('*')
      .eq('race_id', raceId)
      .order('finish_position', { ascending: true });

    if (data && data.length > 0) {
      setExistingResults(data);
      setResults(data.map((r) => ({
        driver_id: r.driver_id,
        finish_position: r.finish_position,
        stage_1_winner: r.stage_1_winner,
        stage_2_winner: r.stage_2_winner,
        laps_led: r.laps_led,
        most_laps_led: r.most_laps_led,
      })));
    } else {
      setExistingResults([]);
      // Initialize with empty top 20 positions
      setResults([]);
    }
  };

  const handleRaceChange = (raceId: string) => {
    const race = races.find((r) => r.id === raceId);
    if (race) {
      setSelectedRace(race);
      setResults([]);
      setExistingResults([]);
      setSuccess(false);
      setError(null);
    }
  };

  const addResult = () => {
    const nextPosition = results.length + 1;
    setResults([...results, {
      driver_id: '',
      finish_position: nextPosition,
      stage_1_winner: false,
      stage_2_winner: false,
      laps_led: 0,
      most_laps_led: false,
    }]);
  };

  const updateResult = (index: number, field: keyof ResultEntry, value: any) => {
    const newResults = [...results];
    newResults[index] = { ...newResults[index], [field]: value };

    // If setting most_laps_led to true, unset it for others
    if (field === 'most_laps_led' && value === true) {
      newResults.forEach((r, i) => {
        if (i !== index) r.most_laps_led = false;
      });
    }

    setResults(newResults);
  };

  const removeResult = (index: number) => {
    const newResults = results.filter((_, i) => i !== index);
    // Renumber positions
    newResults.forEach((r, i) => {
      r.finish_position = i + 1;
    });
    setResults(newResults);
  };

  const handleSave = async () => {
    if (!selectedRace) return;

    // Validate
    const errors: string[] = [];
    const usedDrivers = new Set<string>();
    const usedPositions = new Set<number>();

    results.forEach((r, i) => {
      if (!r.driver_id) {
        errors.push(`Position ${r.finish_position}: No driver selected`);
      }
      if (usedDrivers.has(r.driver_id)) {
        errors.push(`Position ${r.finish_position}: Driver already used`);
      }
      if (usedPositions.has(r.finish_position)) {
        errors.push(`Position ${r.finish_position}: Duplicate position`);
      }
      usedDrivers.add(r.driver_id);
      usedPositions.add(r.finish_position);
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Delete existing results
      await supabase
        .from('race_results')
        .delete()
        .eq('race_id', selectedRace.id);

      // Insert new results
      const { error: insertError } = await supabase
        .from('race_results')
        .insert(results.map((r) => ({
          race_id: selectedRace.id,
          driver_id: r.driver_id,
          finish_position: r.finish_position,
          stage_1_winner: r.stage_1_winner,
          stage_2_winner: r.stage_2_winner,
          laps_led: r.laps_led,
          most_laps_led: r.most_laps_led,
        })));

      if (insertError) throw insertError;

      // Update race status to final
      await supabase
        .from('races')
        .update({ status: 'final' })
        .eq('id', selectedRace.id);

      setSuccess(true);

      // Reload data
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save results');
    } finally {
      setSaving(false);
    }
  };

  const getDriverById = (id: string) => drivers.find((d) => d.id === id);

  const availableDrivers = (currentDriverId: string) => {
    const usedIds = new Set(results.map((r) => r.driver_id).filter((id) => id !== currentDriverId));
    return drivers.filter((d) => !usedIds.has(d.id));
  };

  const fetchFromNascarApi = async () => {
    if (!selectedRace) return;

    setFetchingFromApi(true);
    setError(null);
    setApiResult(null);

    try {
      const response = await fetch('/api/nascar/fetch-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          race_id: selectedRace.id,
          year: seasonYear,
          race_name: selectedRace.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch results');
      }

      setApiResult(data);

      // Reload the results to show imported data
      await loadExistingResults(selectedRace.id);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to fetch from NASCAR API');
    } finally {
      setFetchingFromApi(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Enter Race Results</h2>
      </div>

      {/* Race Selector */}
      <div className="bg-gray-800 rounded-lg p-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Race
        </label>
        <select
          value={selectedRace?.id || ''}
          onChange={(e) => handleRaceChange(e.target.value)}
          className="w-full md:w-96 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
        >
          <option value="">Select a race...</option>
          {races.map((race) => (
            <option key={race.id} value={race.id}>
              Race {race.race_number}: {race.name} {race.status === 'final' ? '(Final)' : ''}
            </option>
          ))}
        </select>

        {selectedRace && (
          <div className="mt-4 text-sm text-gray-400">
            <p><span className="text-gray-500">Track:</span> {selectedRace.track}</p>
            <p><span className="text-gray-500">Date:</span> {new Date(selectedRace.scheduled_datetime).toLocaleString()}</p>
            <p>
              <span className="text-gray-500">Status:</span>{' '}
              <span className={selectedRace.status === 'final' ? 'text-green-500' : 'text-yellow-500'}>
                {selectedRace.status}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* NASCAR API Import */}
      {selectedRace && (
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Import from NASCAR API
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                Automatically fetch official race results from Sportradar
              </p>
            </div>
            <button
              onClick={fetchFromNascarApi}
              disabled={fetchingFromApi || selectedRace.status === 'final'}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {fetchingFromApi ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  Fetch Results
                </>
              )}
            </button>
          </div>

          {/* API Result Display */}
          {apiResult && (
            <div className={`mt-4 p-4 rounded-lg ${apiResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              <p className={apiResult.success ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                {apiResult.message}
              </p>
              {apiResult.raceInfo && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Results:</span>{' '}
                    <span className="text-white">{apiResult.raceInfo.resultsCount} drivers</span>
                  </div>
                  {apiResult.raceInfo.stage1Winner && (
                    <div>
                      <span className="text-gray-500">Stage 1:</span>{' '}
                      <span className="text-white">#{apiResult.raceInfo.stage1Winner.carNumber} {apiResult.raceInfo.stage1Winner.name}</span>
                    </div>
                  )}
                  {apiResult.raceInfo.stage2Winner && (
                    <div>
                      <span className="text-gray-500">Stage 2:</span>{' '}
                      <span className="text-white">#{apiResult.raceInfo.stage2Winner.carNumber} {apiResult.raceInfo.stage2Winner.name}</span>
                    </div>
                  )}
                  {apiResult.raceInfo.mostLapsLed && (
                    <div>
                      <span className="text-gray-500">Most Laps:</span>{' '}
                      <span className="text-white">#{apiResult.raceInfo.mostLapsLed.carNumber} ({apiResult.raceInfo.mostLapsLed.lapsLed} laps)</span>
                    </div>
                  )}
                </div>
              )}
              {apiResult.warnings && (
                <div className="mt-3 p-3 bg-yellow-500/10 rounded border border-yellow-500/30">
                  <p className="text-yellow-400 text-sm font-medium">{apiResult.warnings.message}</p>
                  <p className="text-yellow-300/70 text-xs mt-1">
                    {apiResult.warnings.unmatchedDrivers.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-gray-500 text-xs mt-4">
            Requires SPORTRADAR_API_KEY in environment variables.{' '}
            <a href="https://developer.sportradar.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              Get your free trial key
            </a>
          </p>
        </div>
      )}

      {selectedRace && (
        <>
          {/* Results Entry */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Race Results</h3>
              <button
                onClick={addResult}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Add Position
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4 whitespace-pre-line">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded mb-4">
                Results saved successfully! Scores will be calculated.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                    <th className="pb-3 pr-4 w-20">Pos</th>
                    <th className="pb-3 pr-4">Driver</th>
                    <th className="pb-3 pr-4 text-center w-24">Stage 1</th>
                    <th className="pb-3 pr-4 text-center w-24">Stage 2</th>
                    <th className="pb-3 pr-4 text-center w-24">Laps Led</th>
                    <th className="pb-3 pr-4 text-center w-24">Most Laps</th>
                    <th className="pb-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-b border-gray-700/50">
                      <td className="py-3 pr-4">
                        <span className={`font-bold text-lg ${
                          result.finish_position <= 3 ? 'text-yellow-500' :
                          result.finish_position <= 10 ? 'text-green-500' : 'text-gray-400'
                        }`}>
                          {result.finish_position}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <select
                          value={result.driver_id}
                          onChange={(e) => updateResult(index, 'driver_id', e.target.value)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                        >
                          <option value="">Select driver...</option>
                          {availableDrivers(result.driver_id).map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              #{driver.car_number} - {driver.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <input
                          type="checkbox"
                          checked={result.stage_1_winner}
                          onChange={(e) => updateResult(index, 'stage_1_winner', e.target.checked)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <input
                          type="checkbox"
                          checked={result.stage_2_winner}
                          onChange={(e) => updateResult(index, 'stage_2_winner', e.target.checked)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          value={result.laps_led}
                          onChange={(e) => updateResult(index, 'laps_led', parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-center"
                          min={0}
                        />
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <input
                          type="checkbox"
                          checked={result.most_laps_led}
                          onChange={(e) => updateResult(index, 'most_laps_led', e.target.checked)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => removeResult(index)}
                          className="text-red-500 hover:text-red-400"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {results.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                Click &quot;Add Position&quot; to start entering results.
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-6 flex space-x-4">
                <button
                  onClick={handleSave}
                  disabled={saving || results.length === 0}
                  className="px-6 py-3 bg-yellow-500 text-black font-medium rounded-md hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Results & Calculate Scores'}
                </button>
                <button
                  onClick={() => {
                    // Quick add top 10
                    const newResults: ResultEntry[] = [];
                    for (let i = 1; i <= 10; i++) {
                      if (!results.find((r) => r.finish_position === i)) {
                        newResults.push({
                          driver_id: '',
                          finish_position: i,
                          stage_1_winner: false,
                          stage_2_winner: false,
                          laps_led: 0,
                          most_laps_led: false,
                        });
                      }
                    }
                    setResults([...results, ...newResults].sort((a, b) => a.finish_position - b.finish_position));
                  }}
                  className="px-4 py-3 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
                >
                  Add Top 10 Positions
                </button>
              </div>
            )}
          </div>

          {/* Scoring Reference */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Scoring Reference</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-400">1st:</span> <span className="text-white">10 pts</span>
              </div>
              <div>
                <span className="text-gray-400">2nd:</span> <span className="text-white">9 pts</span>
              </div>
              <div>
                <span className="text-gray-400">3rd:</span> <span className="text-white">8 pts</span>
              </div>
              <div>
                <span className="text-gray-400">4th:</span> <span className="text-white">7 pts</span>
              </div>
              <div>
                <span className="text-gray-400">5th:</span> <span className="text-white">6 pts</span>
              </div>
              <div>
                <span className="text-gray-400">6th:</span> <span className="text-white">5 pts</span>
              </div>
              <div>
                <span className="text-gray-400">7th:</span> <span className="text-white">4 pts</span>
              </div>
              <div>
                <span className="text-gray-400">8th:</span> <span className="text-white">3 pts</span>
              </div>
              <div>
                <span className="text-gray-400">9th:</span> <span className="text-white">2 pts</span>
              </div>
              <div>
                <span className="text-gray-400">10th:</span> <span className="text-white">1 pt</span>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <p><span className="text-yellow-500">+1</span> Stage win bonus</p>
              <p><span className="text-yellow-500">+1</span> Most laps led bonus</p>
              <p><span className="text-yellow-500">+1</span> All 3 drivers in top 10 bonus</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
