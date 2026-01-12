'use client';

import { useState } from 'react';
import Link from 'next/link';

interface FixResult {
  success: boolean;
  summary?: {
    races_in_database: number;
    races_matched_to_json: number;
    races_not_matched: number;
    results_updated: number;
    results_skipped: number;
    elapsed_seconds: number;
  };
  top_drivers_fixed?: { driver: string; fixes: number }[];
  error?: string;
  logs?: string[];
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

export default function FixDataPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningQuick, setIsRunningQuick] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
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

  const runRelinkAllResults = async () => {
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/relink-all-results');
      const data = await response.json();

      if (response.ok && data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Failed to run fix');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error - the request may have timed out. Try refreshing and running again.');
    } finally {
      setIsRunning(false);
    }
  };

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

      {/* Quick Fix for SVG and Blaney */}
      <div className="glass rounded-xl p-6 border border-emerald-500/30">
        <h2 className="text-xl font-bold text-white mb-2">Quick Fix: SVG & Blaney</h2>
        <p className="text-purple-300 text-sm mb-4">
          Fast fix specifically for SVG and Blaney. This only updates results that have their names in the api_driver_name field.
        </p>

        <button
          onClick={runQuickFix}
          disabled={isRunningQuick || isRunning}
          className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
            isRunningQuick || isRunning
              ? 'bg-purple-700 text-purple-300 cursor-not-allowed'
              : 'text-purple-900 bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 hover:from-emerald-300 hover:via-green-300 hover:to-emerald-400 shadow-lg shadow-emerald-500/25'
          }`}
        >
          {isRunningQuick ? 'Running...' : 'Run Quick Fix (Recommended)'}
        </button>
      </div>

      {/* Quick Fix Results */}
      {quickResult && quickResult.success && (
        <div className="glass rounded-xl p-6 border border-emerald-500/30 bg-emerald-500/10">
          <h2 className="text-xl font-bold text-emerald-400 mb-4">Quick Fix Completed!</h2>

          {quickResult.summary && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">SVG Results Fixed</div>
                <div className="text-2xl font-bold text-emerald-400">{quickResult.summary.svg_results_fixed}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Blaney Results Fixed</div>
                <div className="text-2xl font-bold text-emerald-400">{quickResult.summary.blaney_results_fixed}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Total Fixed</div>
                <div className="text-2xl font-bold text-amber-400">{quickResult.summary.total_fixed}</div>
              </div>
            </div>
          )}

          {quickResult.current_state && (
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-white">Current State:</h3>
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
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-purple-700/30">
            <p className="text-emerald-300">
              Now refresh the <Link href="/driver-rankings" className="text-amber-400 hover:text-amber-300 underline">Driver Rankings</Link> page to see the corrected data!
            </p>
          </div>
        </div>
      )}

      {/* Relink All Results */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-2">Relink All Race Results (Full)</h2>
        <p className="text-purple-300 text-sm mb-4">
          This will re-match ALL race results to the correct drivers using driver names from the source data.
          Use this to fix issues where drivers show incorrect points (like SVG or Blaney).
        </p>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
          <h3 className="text-amber-400 font-semibold mb-2">What this does:</h3>
          <ul className="text-purple-300 text-sm space-y-1 list-disc list-inside">
            <li>Loads race results from JSON source files (2020-2025)</li>
            <li>Matches each result to the correct driver by name</li>
            <li>Updates driver_id for any mislinked results</li>
            <li>Fixes issues from driver car number changes (like SVG #88 → #16)</li>
          </ul>
        </div>

        <button
          onClick={runRelinkAllResults}
          disabled={isRunning}
          className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
            isRunning
              ? 'bg-purple-700 text-purple-300 cursor-not-allowed'
              : 'text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25'
          }`}
        >
          {isRunning ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Running... (this may take 30-60 seconds)
            </span>
          ) : (
            'Run Relink All Results'
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-xl p-6 border border-red-500/30 bg-red-500/10">
          <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Results Display */}
      {result && result.success && (
        <div className="glass rounded-xl p-6 border border-emerald-500/30 bg-emerald-500/10">
          <h2 className="text-xl font-bold text-emerald-400 mb-4">Fix Completed Successfully!</h2>

          {result.summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Races in Database</div>
                <div className="text-2xl font-bold text-white">{result.summary.races_in_database}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Races Matched</div>
                <div className="text-2xl font-bold text-emerald-400">{result.summary.races_matched_to_json}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Results Updated</div>
                <div className="text-2xl font-bold text-amber-400">{result.summary.results_updated}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Results Skipped</div>
                <div className="text-2xl font-bold text-purple-300">{result.summary.results_skipped}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Races Not Matched</div>
                <div className="text-2xl font-bold text-red-400">{result.summary.races_not_matched}</div>
              </div>
              <div className="bg-purple-900/30 rounded-lg p-4">
                <div className="text-purple-400 text-sm">Time Elapsed</div>
                <div className="text-2xl font-bold text-white">{result.summary.elapsed_seconds}s</div>
              </div>
            </div>
          )}

          {result.top_drivers_fixed && result.top_drivers_fixed.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-white mb-3">Top Drivers Fixed</h3>
              <div className="space-y-2">
                {result.top_drivers_fixed.map((driver, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-purple-900/30 rounded-lg px-4 py-2">
                    <span className="text-white">{driver.driver}</span>
                    <span className="text-amber-400 font-bold">{driver.fixes} results fixed</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-purple-700/30">
            <p className="text-emerald-300">
              Now refresh the <Link href="/driver-rankings" className="text-amber-400 hover:text-amber-300 underline">Driver Rankings</Link> page to see the corrected data!
            </p>
          </div>
        </div>
      )}

      {/* Other Fix Tools */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Other Diagnostic Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="/api/admin/find-duplicate-drivers"
            target="_blank"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            Find Duplicate Drivers
          </a>
          <a
            href="/api/admin/debug-rankings?driver=gisbergen"
            target="_blank"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            Debug SVG Rankings
          </a>
          <a
            href="/api/admin/debug-rankings?driver=blaney"
            target="_blank"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            Debug Blaney Rankings
          </a>
          <a
            href="/api/admin/fix-driver-links"
            target="_blank"
            className="flex items-center justify-center p-4 bg-purple-900/30 rounded-lg text-purple-200 hover:bg-purple-800/40 transition-colors border border-purple-700/30"
          >
            Fix Driver Links (Preview)
          </a>
        </div>
      </div>
    </div>
  );
}
