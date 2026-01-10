'use client';

import { useState } from 'react';

interface ImportResult {
  race: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  resultsCount?: number;
}

interface ResultsImportResponse {
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

interface ScheduleImportResponse {
  success: boolean;
  message: string;
  seasonId?: string;
  racesImported?: number;
  races?: Array<{
    number: number;
    name: string;
    track: string;
    date: string;
    status: string;
  }>;
  error?: string;
}

export default function AdminImportPage() {
  const [year, setYear] = useState(2025);

  // Schedule import state
  const [importingSchedule, setImportingSchedule] = useState(false);
  const [scheduleResponse, setScheduleResponse] = useState<ScheduleImportResponse | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Results import state
  const [importingResults, setImportingResults] = useState(false);
  const [resultsResponse, setResultsResponse] = useState<ResultsImportResponse | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const handleImportSchedule = async () => {
    setImportingSchedule(true);
    setScheduleError(null);
    setScheduleResponse(null);

    try {
      const res = await fetch('/api/nascar/import-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import schedule');
      }

      setScheduleResponse(data);
    } catch (err: any) {
      setScheduleError(err.message || 'Import failed');
    } finally {
      setImportingSchedule(false);
    }
  };

  const handleImportResults = async () => {
    setImportingResults(true);
    setResultsError(null);
    setResultsResponse(null);

    try {
      const res = await fetch('/api/nascar/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import results');
      }

      setResultsResponse(data);
    } catch (err: any) {
      setResultsError(err.message || 'Import failed');
    } finally {
      setImportingResults(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">NASCAR API Import</h2>
      </div>

      {/* Year Selector */}
      <div className="bg-gray-800 rounded-lg p-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Select Season Year
        </label>
        <select
          value={year}
          onChange={(e) => {
            setYear(parseInt(e.target.value));
            setScheduleResponse(null);
            setResultsResponse(null);
            setScheduleError(null);
            setResultsError(null);
          }}
          className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
          disabled={importingSchedule || importingResults}
        >
          {[2025, 2024, 2023, 2022, 2021, 2020].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Step 1: Import Schedule */}
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-lg p-6 border border-green-500/30">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold text-sm">1</span>
          <h3 className="text-lg font-bold text-white">Import Race Schedule</h3>
        </div>
        <p className="text-gray-400 text-sm mb-6 ml-11">
          First, import the race schedule for {year}. This creates the season and all races in your database.
        </p>

        <div className="flex items-center gap-4 ml-11">
          <button
            onClick={handleImportSchedule}
            disabled={importingSchedule || importingResults}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {importingSchedule ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Importing Schedule...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Import {year} Schedule
              </>
            )}
          </button>
        </div>

        {scheduleError && (
          <div className="mt-4 ml-11 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 font-medium">{scheduleError}</p>
          </div>
        )}

        {scheduleResponse && scheduleResponse.success && (
          <div className="mt-4 ml-11 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <p className="text-green-400 font-medium">{scheduleResponse.message}</p>
            {scheduleResponse.races && scheduleResponse.races.length > 0 && (
              <div className="mt-3 max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Race</th>
                      <th className="pb-2 pr-4">Track</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleResponse.races.map((race) => (
                      <tr key={race.number} className="border-b border-gray-700/50">
                        <td className="py-2 pr-4 text-gray-300">{race.number}</td>
                        <td className="py-2 pr-4 text-white">{race.name}</td>
                        <td className="py-2 pr-4 text-gray-400">{race.track}</td>
                        <td className="py-2 text-gray-400">{new Date(race.date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Import Results */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/30">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">2</span>
          <h3 className="text-lg font-bold text-white">Import Race Results</h3>
        </div>
        <p className="text-gray-400 text-sm mb-6 ml-11">
          After importing the schedule, import the race results. This fetches finishing positions, stage winners, and laps led for all completed races.
        </p>

        <div className="flex items-center gap-4 ml-11">
          <button
            onClick={handleImportResults}
            disabled={importingSchedule || importingResults}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {importingResults ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Importing Results...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                Import {year} Results
              </>
            )}
          </button>
        </div>

        {importingResults && (
          <div className="mt-4 ml-11 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-400">
              Importing race results... This may take several minutes due to API rate limits (1 request/second).
            </p>
          </div>
        )}

        {resultsError && (
          <div className="mt-4 ml-11 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 font-medium">{resultsError}</p>
          </div>
        )}

        {resultsResponse && (
          <div className="mt-4 ml-11 bg-gray-800 rounded-lg p-4 border border-gray-700">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-white">{resultsResponse.summary.total}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-green-400">{resultsResponse.summary.success}</div>
                <div className="text-xs text-gray-400">Imported</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-yellow-400">{resultsResponse.summary.skipped}</div>
                <div className="text-xs text-gray-400">Skipped</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-red-400">{resultsResponse.summary.errors}</div>
                <div className="text-xs text-gray-400">Errors</div>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-2 pr-4">Race</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {resultsResponse.results.map((result, index) => (
                    <tr key={index} className="border-b border-gray-700/50">
                      <td className="py-2 pr-4 text-white">{result.race}</td>
                      <td className="py-2 pr-4">
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
                      <td className="py-2 text-gray-400 text-xs">
                        {result.message}
                        {result.resultsCount && (
                          <span className="text-green-400 ml-1">({result.resultsCount})</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-bold text-white mb-4">How It Works</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-green-400 font-medium mb-2">Step 1: Import Schedule</h4>
            <ul className="space-y-1 text-gray-400 text-sm">
              <li>- Fetches full season schedule from RapidAPI</li>
              <li>- Creates season record in database</li>
              <li>- Creates all race records with dates/tracks</li>
              <li>- Initializes team standings and bonuses</li>
            </ul>
          </div>
          <div>
            <h4 className="text-blue-400 font-medium mb-2">Step 2: Import Results</h4>
            <ul className="space-y-1 text-gray-400 text-sm">
              <li>- Fetches results for each completed race</li>
              <li>- Imports all finishing positions</li>
              <li>- Identifies stage winners and laps led</li>
              <li>- Matches drivers by car number</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 p-3 bg-purple-900/30 border border-purple-500/30 rounded-lg">
          <p className="text-purple-300 text-sm font-medium mb-1">API Setup Required</p>
          <p className="text-gray-400 text-sm">
            Get your free API key at{' '}
            <a
              href="https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/nascar-motorsport-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline"
            >
              RapidAPI NASCAR Motorsport
            </a>
            {' '}and add it to Vercel as <code className="bg-gray-700 px-1 rounded">RAPIDAPI_KEY</code>
          </p>
        </div>
      </div>
    </div>
  );
}
