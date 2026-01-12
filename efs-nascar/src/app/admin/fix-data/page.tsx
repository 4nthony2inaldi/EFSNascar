'use client';

import { useState } from 'react';
import Link from 'next/link';

interface YearFixResult {
  success: boolean;
  year?: number;
  summary?: {
    races_in_season: number;
    races_processed: number;
    results_updated: number;
    results_skipped: number;
    elapsed_seconds: number;
  };
  top_drivers_fixed?: { driver: string; fixes: number }[];
  error?: string;
}

interface QuickFixResult {
  success: boolean;
  summary?: {
    svg_results_fixed: number;
    blaney_results_fixed: number;
    total_fixed: number;
  };
  current_state?: {
    svg: { name: string; car_number: number; total_results: number; wins: number };
    blaney: { name: string; car_number: number; total_results: number; wins: number };
  };
  fixes?: string[];
  error?: string;
}

const YEARS = [2025, 2024, 2023, 2022, 2020];

export default function FixDataPage() {
  const [runningYear, setRunningYear] = useState<number | null>(null);
  const [isRunningQuick, setIsRunningQuick] = useState(false);
  const [yearResults, setYearResults] = useState<Record<number, YearFixResult>>({});
  const [quickResult, setQuickResult] = useState<QuickFixResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runQuickFix = async () => {
    setIsRunningQuick(true);
    setQuickResult(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/fix-svg-blaney');
      const data = await response.json();

      if (response.ok && data.success) {
        setQuickResult(data);
      } else {
        setError(data.error || 'Failed to run quick fix');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunningQuick(false);
    }
  };

  const runFixForYear = async (year: number) => {
    setRunningYear(year);
    setError(null);

    try {
      const response = await fetch(`/api/admin/fix-by-year?year=${year}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setYearResults(prev => ({ ...prev, [year]: data }));
      } else {
        setError(data.error || `Failed to fix year ${year}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRunningYear(null);
    }
  };

  const runAllYears = async () => {
    for (const year of YEARS) {
      await runFixForYear(year);
      // Small delay between years
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const totalFixed = Object.values(yearResults).reduce(
    (sum, r) => sum + (r.summary?.results_updated || 0),
    0
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Fix Data Issues</h1>
          <p className="text-purple-400 mt-1">
            Tools to fix driver linking and data integrity issues
          </p>
        </div>
        <Link
          href="/admin"
          className="text-purple-400 hover:text-purple-300"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-xl p-6 border border-red-500/30 bg-red-500/10">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Fix By Year - Main Section */}
      <div className="glass rounded-xl p-6 border border-amber-500/30">
        <h2 className="text-xl font-bold text-white mb-2">Fix Results By Year</h2>
        <p className="text-purple-300 text-sm mb-4">
          Click each year to fix driver linking for that season. This won't timeout because it processes one year at a time.
        </p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
          <p className="text-amber-300 text-sm">
            <strong>Recommended:</strong> Click "Fix All Years" or click each year button from 2025 down to 2020.
          </p>
        </div>

        {/* Fix All Button */}
        <button
          onClick={runAllYears}
          disabled={runningYear !== null || isRunningQuick}
          className={`w-full mb-4 px-6 py-4 rounded-lg font-bold text-lg transition-all ${
            runningYear !== null || isRunningQuick
              ? 'bg-purple-700 text-purple-300 cursor-not-allowed'
              : 'text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25'
          }`}
        >
          {runningYear !== null ? `Fixing ${runningYear}...` : 'Fix All Years (Recommended)'}
        </button>

        {/* Year Buttons */}
        <div className="grid grid-cols-5 gap-3">
          {YEARS.map(year => {
            const result = yearResults[year];
            const isRunning = runningYear === year;
            const isComplete = result?.success;

            return (
              <button
                key={year}
                onClick={() => runFixForYear(year)}
                disabled={runningYear !== null || isRunningQuick}
                className={`px-4 py-3 rounded-lg font-bold transition-all ${
                  isComplete
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : isRunning
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                    : runningYear !== null
                    ? 'bg-purple-900/30 text-purple-500 cursor-not-allowed'
                    : 'bg-purple-900/30 text-purple-200 hover:bg-purple-800/40 border border-purple-700/30'
                }`}
              >
                {isRunning ? '...' : year}
                {isComplete && (
                  <span className="block text-xs mt-1">
                    {result.summary?.results_updated || 0} fixed
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Total Results */}
        {totalFixed > 0 && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-emerald-400 font-bold">Total Results Fixed:</span>
              <span className="text-2xl font-bold text-emerald-400">{totalFixed}</span>
            </div>
            <p className="text-emerald-300 text-sm mt-2">
              Refresh the <Link href="/driver-rankings" className="text-amber-400 hover:text-amber-300 underline">Driver Rankings</Link> page to see the corrected data!
            </p>
          </div>
        )}
      </div>

      {/* Year Results Details */}
      {Object.entries(yearResults).map(([year, result]) => (
        result.success && result.top_drivers_fixed && result.top_drivers_fixed.length > 0 && (
          <div key={year} className="glass rounded-xl p-6 border border-emerald-500/30 bg-emerald-500/5">
            <h3 className="text-lg font-bold text-emerald-400 mb-3">
              {year} - {result.summary?.results_updated || 0} results fixed
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {result.top_drivers_fixed.slice(0, 5).map((driver, idx) => (
                <div key={idx} className="bg-purple-900/30 rounded-lg px-3 py-2 text-sm">
                  <span className="text-white">{driver.driver}</span>
                  <span className="text-amber-400 ml-2">+{driver.fixes}</span>
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {/* Quick Fix for SVG and Blaney */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-2">Quick Fix: SVG & Blaney Only</h2>
        <p className="text-purple-300 text-sm mb-4">
          Fast fix specifically for SVG and Blaney. Only works if api_driver_name is already set.
        </p>

        <button
          onClick={runQuickFix}
          disabled={isRunningQuick || runningYear !== null}
          className={`px-6 py-3 rounded-lg font-bold transition-all ${
            isRunningQuick || runningYear !== null
              ? 'bg-purple-700 text-purple-300 cursor-not-allowed'
              : 'bg-purple-900/30 text-purple-200 hover:bg-purple-800/40 border border-purple-700/30'
          }`}
        >
          {isRunningQuick ? 'Running...' : 'Run Quick Fix'}
        </button>
      </div>

      {/* Quick Fix Results */}
      {quickResult && quickResult.success && (
        <div className="glass rounded-xl p-6 border border-emerald-500/30 bg-emerald-500/10">
          <h2 className="text-xl font-bold text-emerald-400 mb-4">Quick Fix Completed!</h2>

          {quickResult.summary && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">SVG Fixed</div>
                <div className="text-2xl font-bold text-emerald-400">{quickResult.summary.svg_results_fixed}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Blaney Fixed</div>
                <div className="text-2xl font-bold text-emerald-400">{quickResult.summary.blaney_results_fixed}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Total</div>
                <div className="text-2xl font-bold text-amber-400">{quickResult.summary.total_fixed}</div>
              </div>
            </div>
          )}

          {quickResult.current_state && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-amber-400 font-bold">{quickResult.current_state.svg.name}</div>
                <div className="text-purple-300 text-sm">#{quickResult.current_state.svg.car_number}</div>
                <div className="mt-2 text-white">
                  {quickResult.current_state.svg.total_results} results, {quickResult.current_state.svg.wins} wins
                </div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-amber-400 font-bold">{quickResult.current_state.blaney.name}</div>
                <div className="text-purple-300 text-sm">#{quickResult.current_state.blaney.car_number}</div>
                <div className="mt-2 text-white">
                  {quickResult.current_state.blaney.total_results} results, {quickResult.current_state.blaney.wins} wins
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diagnostic Tools */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Diagnostic Tools</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a
            href="/api/admin/find-duplicate-drivers"
            target="_blank"
            className="p-3 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 text-center text-sm border border-purple-700/30"
          >
            Find Duplicates
          </a>
          <a
            href="/api/admin/debug-rankings?driver=gisbergen"
            target="_blank"
            className="p-3 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 text-center text-sm border border-purple-700/30"
          >
            Debug SVG
          </a>
          <a
            href="/api/admin/debug-rankings?driver=blaney"
            target="_blank"
            className="p-3 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 text-center text-sm border border-purple-700/30"
          >
            Debug Blaney
          </a>
          <a
            href="/api/admin/fix-driver-links"
            target="_blank"
            className="p-3 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 text-center text-sm border border-purple-700/30"
          >
            Fix Links
          </a>
        </div>
      </div>
    </div>
  );
}
