'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ImportResult {
  race: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  resultsCount?: number;
}

interface ImportResponse {
  success: boolean;
  summary: {
    total: number;
    success: number;
    errors: number;
    skipped: number;
  };
  results: ImportResult[];
  error?: string;
}

export default function AdminImportPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [importing, setImporting] = useState(false);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch('/api/nascar/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import');
      }

      setResponse(data);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Bulk Import Race Results</h2>
      </div>

      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/30">
        <h3 className="text-lg font-bold text-white mb-2">Import from NASCAR API</h3>
        <p className="text-gray-400 text-sm mb-6">
          Automatically fetch and import official race results for an entire season from Sportradar.
          This will import all completed races that don&apos;t already have final results.
        </p>

        <div className="flex items-end gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Season Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
              disabled={importing}
            >
              {[2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleImport}
            disabled={importing}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {importing ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Import {year} Season
              </>
            )}
          </button>
        </div>

        {importing && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-400">
              Importing race results... This may take several minutes due to API rate limits (1 request/second).
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        )}
      </div>

      {response && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-4">Import Results</h3>

          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{response.summary.total}</div>
              <div className="text-sm text-gray-400">Total Races</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{response.summary.success}</div>
              <div className="text-sm text-gray-400">Imported</div>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{response.summary.skipped}</div>
              <div className="text-sm text-gray-400">Skipped</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{response.summary.errors}</div>
              <div className="text-sm text-gray-400">Errors</div>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-3 pr-4">Race</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3">Message</th>
                </tr>
              </thead>
              <tbody>
                {response.results.map((result, index) => (
                  <tr key={index} className="border-b border-gray-700/50">
                    <td className="py-3 pr-4 text-white">{result.race}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        result.status === 'success'
                          ? 'bg-green-500/20 text-green-400'
                          : result.status === 'skipped'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {result.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400 text-sm">
                      {result.message}
                      {result.resultsCount && (
                        <span className="text-green-400 ml-2">({result.resultsCount} drivers)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
        <ul className="space-y-2 text-gray-400 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-blue-400">1.</span>
            Fetches the NASCAR Cup Series schedule for the selected year from Sportradar
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400">2.</span>
            Matches races in your database to races in the API by name
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400">3.</span>
            For each completed race, fetches full results including positions, stage winners, and laps led
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400">4.</span>
            Matches drivers by car number (primary) or name (fallback)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400">5.</span>
            Imports results and marks races as final
          </li>
        </ul>
        <p className="mt-4 text-yellow-400 text-sm">
          Note: Due to API rate limits, importing a full season takes ~40 seconds (1 request per second).
        </p>
      </div>
    </div>
  );
}
