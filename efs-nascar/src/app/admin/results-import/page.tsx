'use client';

import { useState, useEffect } from 'react';

interface RaceResult {
  race: string;
  imported: number;
  skipped: number;
  dbRace?: string;
}

interface ImportResponse {
  success: boolean;
  year: number;
  totalImported: number;
  totalSkipped: number;
  racesImported: number;
  raceResults: RaceResult[];
  driversNotFound: string[];
  racesNotFound: string[];
  availableYears?: number[];
  error?: string;
  // Debug info
  driversInDatabase?: number;
  sampleDbDrivers?: string[];
}

interface Season {
  id: string;
  name: string;
  year: number;
}

export default function ResultsImportPage() {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [raceNumber, setRaceNumber] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ message: string; deleted: number } | null>(null);
  const [syncingDrivers, setSyncingDrivers] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; added: number; drivers?: string[] } | null>(null);

  useEffect(() => {
    // Fetch available years and seasons
    Promise.all([
      fetch('/api/admin/results-import').then(res => res.json()),
      fetch('/api/admin/seasons').then(res => res.json())
    ])
      .then(([yearsData, seasonsData]) => {
        if (yearsData.availableYears) {
          setAvailableYears(yearsData.availableYears);
        }
        if (seasonsData.seasons) {
          setSeasons(seasonsData.seasons);
        }
      })
      .catch(console.error)
      .finally(() => setChecking(false));
  }, []);

  // Auto-select season when year changes
  useEffect(() => {
    if (selectedYear) {
      const matchingSeason = seasons.find(s => s.year === selectedYear);
      if (matchingSeason) {
        setSelectedSeasonId(matchingSeason.id);
      }
    }
  }, [selectedYear, seasons]);

  const handleSyncDrivers = async () => {
    setSyncingDrivers(true);
    setSyncResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/drivers/sync', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setSyncResult(data);
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncingDrivers(false);
    }
  };

  const handleDeleteSeasonResults = async () => {
    if (!selectedSeasonId) {
      setError('Please select a year first');
      return;
    }

    if (!confirm('Are you sure you want to delete ALL race results for this season? This cannot be undone.')) {
      return;
    }

    setDeleting(true);
    setDeleteResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/results/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: selectedSeasonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Delete failed');
      }

      setDeleteResult(data);
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleImport = async () => {
    if (!selectedYear) {
      setError('Please select a year');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: { year: number; raceNumber?: number } = { year: selectedYear };
      if (raceNumber) {
        body.raceNumber = raceNumber;
      }

      const res = await fetch('/api/admin/results-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Import Race Results</h1>
        <p className="text-purple-400 mt-1">
          Import historical race results including positions, stage winners, and laps led
        </p>
      </div>

      {/* Info Box */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Data Source</h2>
        <p className="text-purple-300 text-sm mb-4">
          Results data is sourced from the nascaR.data R package, which compiles NASCAR Cup Series
          race results from driveraverages.com. Data includes:
        </p>
        <ul className="text-purple-300 text-sm space-y-1 list-disc list-inside mb-4">
          <li>Finishing positions for all drivers</li>
          <li>Stage 1, Stage 2, and Stage 3 winners (when available in source data)</li>
          <li>Laps led by each driver</li>
          <li>Most laps led designation</li>
        </ul>

        {/* Sync Drivers Section */}
        <div className="mt-4 pt-4 border-t border-purple-700/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-white">Sync Historical Drivers</h3>
              <p className="text-purple-400 text-xs">Add all 108 NASCAR Cup drivers from 2020-2025 to the database</p>
            </div>
            <button
              onClick={handleSyncDrivers}
              disabled={syncingDrivers}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {syncingDrivers ? 'Syncing...' : 'Sync Drivers'}
            </button>
          </div>
          {syncResult && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-emerald-400 text-sm">{syncResult.message}</p>
              {syncResult.drivers && syncResult.drivers.length > 0 && (
                <p className="text-emerald-300 text-xs mt-1">
                  Added: {syncResult.drivers.join(', ')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Import Controls */}
      <div className="glass rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-purple-300 mb-2">
              Select Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : '')}
              disabled={checking}
              className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
            >
              <option value="">Select a year...</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-300 mb-2">
              Race Number (optional)
            </label>
            <input
              type="number"
              value={raceNumber}
              onChange={(e) => setRaceNumber(e.target.value ? Number(e.target.value) : '')}
              placeholder="Leave blank for all races"
              min={1}
              max={40}
              className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white placeholder-purple-600 focus:outline-none focus:border-amber-400"
            />
            <p className="text-purple-500 text-xs mt-1">
              Enter a specific race number to import just that race, or leave blank to import all races for the season.
            </p>
          </div>
        </div>

        {/* Delete Season Results */}
        {selectedYear && selectedSeasonId && (
          <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div>
              <p className="text-red-300 text-sm">Need to start over? Delete all results for {selectedYear} first.</p>
            </div>
            <button
              onClick={handleDeleteSeasonResults}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Season Results'}
            </button>
          </div>
        )}

        {deleteResult && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-emerald-400">{deleteResult.message}</p>
          </div>
        )}

        <div className="pt-4">
          <button
            onClick={handleImport}
            disabled={loading || !selectedYear}
            className="px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 font-bold rounded-lg hover:from-amber-300 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Importing...' : raceNumber ? 'Import Single Race' : 'Import Full Season'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/50 bg-red-500/10">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Import Result */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Import Complete</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-emerald-400">{result.totalImported}</div>
                <div className="text-purple-300 text-sm">Results Imported</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-purple-400">{result.racesImported}</div>
                <div className="text-purple-300 text-sm">Races Processed</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-yellow-400">{result.totalSkipped}</div>
                <div className="text-purple-300 text-sm">Skipped</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-amber-400">{result.year}</div>
                <div className="text-purple-300 text-sm">Season</div>
              </div>
            </div>
          </div>

          {/* Race Results Table */}
          {result.raceResults && result.raceResults.length > 0 && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Race-by-Race Results</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-purple-700/50">
                      <th className="text-left py-2 px-3 text-purple-400">Source Race</th>
                      <th className="text-left py-2 px-3 text-purple-400">Matched To</th>
                      <th className="text-right py-2 px-3 text-purple-400">Imported</th>
                      <th className="text-right py-2 px-3 text-purple-400">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.raceResults.map((race, i) => (
                      <tr key={i} className="border-b border-purple-800/30">
                        <td className="py-2 px-3 text-purple-200">{race.race}</td>
                        <td className="py-2 px-3 text-emerald-300">{race.dbRace || '-'}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">{race.imported}</td>
                        <td className="py-2 px-3 text-right text-yellow-400">{race.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Debug Info */}
          {result.driversInDatabase !== undefined && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-lg font-semibold text-blue-400 mb-4">Debug Info</h2>
              <p className="text-purple-300">
                <strong>Drivers in database:</strong> {result.driversInDatabase}
              </p>
              {result.sampleDbDrivers && result.sampleDbDrivers.length > 0 && (
                <p className="text-purple-400 text-sm mt-2">
                  <strong>Sample normalized names:</strong> {result.sampleDbDrivers.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Warnings */}
          {(result.driversNotFound?.length > 0 || result.racesNotFound?.length > 0) && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-lg font-semibold text-yellow-400 mb-4">Warnings</h2>
              <div className="space-y-4">
                {result.racesNotFound && result.racesNotFound.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-purple-300 mb-2">Races not found in database:</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.racesNotFound.map((r, i) => (
                        <span key={i} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-sm">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.driversNotFound && result.driversNotFound.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-purple-300 mb-2">Drivers not found in database:</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.driversNotFound.map((d, i) => (
                        <span key={i} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-sm">{d}</span>
                      ))}
                    </div>
                    <p className="text-purple-500 text-xs mt-2">
                      You can add missing drivers via the Picks Import page, then re-run the results import.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
