'use client';

import { useState, useEffect } from 'react';

interface RaceResult {
  race: string;
  imported: number;
  skipped: number;
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
}

export default function ResultsImportPage() {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [raceNumber, setRaceNumber] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch available years
    fetch('/api/admin/results-import')
      .then(res => res.json())
      .then(data => {
        if (data.availableYears) {
          setAvailableYears(data.availableYears);
        }
      })
      .catch(console.error)
      .finally(() => setChecking(false));
  }, []);

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
        <ul className="text-purple-300 text-sm space-y-1 list-disc list-inside">
          <li>Finishing positions for all drivers</li>
          <li>Stage 1 and Stage 2 winners</li>
          <li>Laps led by each driver</li>
          <li>Most laps led designation</li>
        </ul>
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
                      <th className="text-left py-2 px-3 text-purple-400">Race</th>
                      <th className="text-right py-2 px-3 text-purple-400">Imported</th>
                      <th className="text-right py-2 px-3 text-purple-400">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.raceResults.map((race, i) => (
                      <tr key={i} className="border-b border-purple-800/30">
                        <td className="py-2 px-3 text-purple-200">{race.race}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">{race.imported}</td>
                        <td className="py-2 px-3 text-right text-yellow-400">{race.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
