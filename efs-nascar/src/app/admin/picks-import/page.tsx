'use client';

import { useState } from 'react';

interface ParsedRow {
  week: number;
  race: string;
  team: string;
  driver1: string;
  driver2: string;
  driver3: string;
}

interface MatchedRow {
  original: ParsedRow;
  raceMatch: { id: string; name: string; race_number: number } | null;
  teamMatch: { id: string; name: string } | null;
  driver1Match: { id: string; name: string } | null;
  driver2Match: { id: string; name: string } | null;
  driver3Match: { id: string; name: string } | null;
  isValid: boolean;
}

interface ImportPreview {
  matched: MatchedRow[];
  unmatched: {
    races: string[];
    teams: string[];
    drivers: string[];
  };
}

export default function PicksImportPage() {
  const [csvData, setCsvData] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string; year: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors?: string[]; skippedInvalid?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingDrivers, setAddingDrivers] = useState(false);
  const [driversAdded, setDriversAdded] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ message: string; deleted: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Fetch seasons on mount
  useState(() => {
    fetch('/api/admin/seasons')
      .then(res => res.json())
      .then(data => {
        if (data.seasons) {
          setSeasons(data.seasons);
        }
      })
      .catch(console.error);
  });

  const handlePreview = async () => {
    if (!csvData.trim() || !seasonId) {
      setError('Please paste CSV data and select a season');
      return;
    }

    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch('/api/admin/picks-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData, seasonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Preview failed');
      }

      setPreview(data);
    } catch (err: any) {
      setError(err.message || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const res = await fetch('/api/admin/picks-import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picks: preview.matched.filter(m => m.isValid),
          seasonId
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setImportResult(data);
      setPreview(null);
      setCsvData('');
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleAddMissingDrivers = async () => {
    if (!preview?.unmatched.drivers.length) return;

    setAddingDrivers(true);
    setDriversAdded(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/drivers/bulk-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverNames: preview.unmatched.drivers
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add drivers');
      }

      setDriversAdded(data.drivers || []);

      // Re-run preview to update matches
      if (data.added > 0) {
        setTimeout(() => handlePreview(), 500);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add drivers');
    } finally {
      setAddingDrivers(false);
    }
  };

  const handleExportPicks = async () => {
    if (!seasonId) {
      setError('Please select a season first');
      return;
    }

    setExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/picks/export?seasonId=${seasonId}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'picks-export.csv';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteSeasonPicks = async () => {
    if (!seasonId) {
      setError('Please select a season first');
      return;
    }

    if (!confirm('Are you sure you want to delete ALL picks for this season? This cannot be undone.')) {
      return;
    }

    setDeleting(true);
    setDeleteResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/picks/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId }),
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

  const validCount = preview?.matched.filter(m => m.isValid).length || 0;
  const invalidCount = preview?.matched.filter(m => !m.isValid).length || 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Import Historical Picks</h1>
        <p className="text-purple-400 mt-1">
          Import team picks from CSV data with fuzzy matching
        </p>
      </div>

      {/* Instructions */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">CSV Format</h2>
        <p className="text-purple-300 text-sm mb-4">
          Paste CSV data with the following columns (header row optional):
        </p>
        <code className="block bg-purple-900/30 p-3 rounded text-sm text-purple-200 mb-4">
          Week, Race, Team, Driver 1, Driver 2, Driver 3
        </code>
        <p className="text-purple-400 text-sm">
          Example: <code className="text-purple-200">1, DAYTONA, ACRacing, Austin Cindric, Austin Dillon, William Byron</code>
        </p>
      </div>

      {/* Input Section */}
      <div className="glass rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">
            Select Season
          </label>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
          >
            <option value="">Select a season...</option>
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} ({season.year})
              </option>
            ))}
          </select>
        </div>

        {/* Export / Delete Season Picks */}
        {seasonId && (
          <div className="space-y-3">
            {/* Export */}
            <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div>
                <p className="text-emerald-300 text-sm">Export existing picks to CSV for review or editing.</p>
              </div>
              <button
                onClick={handleExportPicks}
                disabled={exporting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export Picks to CSV'}
              </button>
            </div>

            {/* Delete */}
            <div className="flex items-center justify-between p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div>
                <p className="text-red-300 text-sm">Need to start over? Delete all picks for this season first.</p>
              </div>
              <button
                onClick={handleDeleteSeasonPicks}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Season Picks'}
              </button>
            </div>
          </div>
        )}

        {deleteResult && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-emerald-400">{deleteResult.message}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">
            Paste CSV Data
          </label>
          <textarea
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            placeholder="Week, Race, Team, Driver 1, Driver 2, Driver 3&#10;1, DAYTONA, ACRacing, Austin Cindric, Austin Dillon, William Byron&#10;1, DAYTONA, Rock Motorsports, Bubba Wallace, Chris Buescher, Justin Haley"
            className="w-full h-64 px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white placeholder-purple-600 focus:outline-none focus:border-amber-400 font-mono text-sm"
          />
        </div>

        <button
          onClick={handlePreview}
          disabled={loading || !csvData.trim() || !seasonId}
          className="px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 font-bold rounded-lg hover:from-amber-300 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Processing...' : 'Preview Matches'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/50 bg-red-500/10">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className={`glass rounded-xl p-6 border ${importResult.success > 0 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          <h3 className={`text-lg font-semibold mb-2 ${importResult.success > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            Import {importResult.success > 0 ? 'Complete' : 'Failed'}!
          </h3>
          <p className="text-purple-200">
            Successfully imported <span className="text-emerald-400 font-bold">{importResult.success}</span> picks.
            {importResult.failed > 0 && (
              <span className="text-red-400 ml-2">({importResult.failed} failed)</span>
            )}
            {importResult.skippedInvalid !== undefined && importResult.skippedInvalid > 0 && (
              <span className="text-yellow-400 ml-2">({importResult.skippedInvalid} skipped - invalid matches)</span>
            )}
          </p>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-red-400 mb-2">Error Details:</h4>
              <ul className="text-sm text-red-300 space-y-1 max-h-40 overflow-y-auto">
                {importResult.errors.map((err, i) => (
                  <li key={i} className="bg-red-500/10 px-2 py-1 rounded">{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Match Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-emerald-400">{validCount}</div>
                <div className="text-purple-300 text-sm">Ready to Import</div>
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="text-3xl font-bold text-red-400">{invalidCount}</div>
                <div className="text-purple-300 text-sm">Unmatched (will skip)</div>
              </div>
            </div>
          </div>

          {/* Unmatched Items */}
          {(preview.unmatched.races.length > 0 || preview.unmatched.teams.length > 0 || preview.unmatched.drivers.length > 0) && (
            <div className="glass rounded-xl p-6">
              <h2 className="text-lg font-semibold text-red-400 mb-4">Unmatched Items</h2>
              <div className="space-y-4">
                {preview.unmatched.races.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-purple-300 mb-2">Races not found:</h3>
                    <div className="flex flex-wrap gap-2">
                      {preview.unmatched.races.map((r, i) => (
                        <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {preview.unmatched.teams.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-purple-300 mb-2">Teams not found:</h3>
                    <div className="flex flex-wrap gap-2">
                      {preview.unmatched.teams.map((t, i) => (
                        <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {preview.unmatched.drivers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-purple-300">Drivers not found:</h3>
                      <button
                        onClick={handleAddMissingDrivers}
                        disabled={addingDrivers}
                        className="px-3 py-1 bg-amber-500/20 text-amber-300 rounded text-sm font-medium hover:bg-amber-500/30 disabled:opacity-50 border border-amber-500/30"
                      >
                        {addingDrivers ? 'Adding...' : 'Add Missing Drivers'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {preview.unmatched.drivers.map((d, i) => (
                        <span key={i} className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-sm">{d}</span>
                      ))}
                    </div>
                    {driversAdded && driversAdded.length > 0 && (
                      <p className="text-emerald-400 text-sm mt-2">
                        ✓ Added {driversAdded.length} drivers: {driversAdded.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview Table */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Match Preview</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-purple-700/50">
                    <th className="text-left py-2 px-3 text-purple-400">Status</th>
                    <th className="text-left py-2 px-3 text-purple-400">Input Race</th>
                    <th className="text-left py-2 px-3 text-purple-400">Matched Race</th>
                    <th className="text-left py-2 px-3 text-purple-400">Input Team</th>
                    <th className="text-left py-2 px-3 text-purple-400">Matched Team</th>
                    <th className="text-left py-2 px-3 text-purple-400">Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.matched.slice(0, 50).map((row, i) => (
                    <tr key={i} className={`border-b border-purple-800/30 ${row.isValid ? '' : 'bg-red-500/5'}`}>
                      <td className="py-2 px-3">
                        {row.isValid ? (
                          <span className="text-emerald-400">✓</span>
                        ) : (
                          <span className="text-red-400">✗</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-purple-300">
                        Week {row.original.week}: {row.original.race}
                      </td>
                      <td className="py-2 px-3">
                        {row.raceMatch ? (
                          <span className="text-emerald-300">#{row.raceMatch.race_number} {row.raceMatch.name}</span>
                        ) : (
                          <span className="text-red-400">Not found</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-purple-300">{row.original.team}</td>
                      <td className="py-2 px-3">
                        {row.teamMatch ? (
                          <span className="text-emerald-300">{row.teamMatch.name}</span>
                        ) : (
                          <span className="text-red-400">Not found</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        <div className="space-y-1">
                          <div>
                            <span className="text-purple-500">{row.original.driver1} → </span>
                            {row.driver1Match ? (
                              <span className="text-emerald-300">{row.driver1Match.name}</span>
                            ) : (
                              <span className="text-red-400">?</span>
                            )}
                          </div>
                          <div>
                            <span className="text-purple-500">{row.original.driver2} → </span>
                            {row.driver2Match ? (
                              <span className="text-emerald-300">{row.driver2Match.name}</span>
                            ) : (
                              <span className="text-red-400">?</span>
                            )}
                          </div>
                          <div>
                            <span className="text-purple-500">{row.original.driver3} → </span>
                            {row.driver3Match ? (
                              <span className="text-emerald-300">{row.driver3Match.name}</span>
                            ) : (
                              <span className="text-red-400">?</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.matched.length > 50 && (
                <p className="text-purple-500 text-sm mt-4">
                  Showing first 50 of {preview.matched.length} rows...
                </p>
              )}
            </div>
          </div>

          {/* Import Button */}
          {validCount > 0 && (
            <div className="flex justify-end">
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-lg hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {importing ? 'Importing...' : `Import ${validCount} Picks`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
