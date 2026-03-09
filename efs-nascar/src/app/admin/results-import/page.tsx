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
  usingAdminClient?: boolean;
  insertErrors?: string[];
}

interface Season {
  id: string;
  name: string;
  year: number;
}

interface Race {
  id: string;
  race_number: number;
  name: string;
  track: string;
  status: string;
}

interface NascarRace {
  race_id: number;
  race_name: string;
  track_name: string;
  date: string;
}

interface ScrapeResult {
  success: boolean;
  raceName: string;
  trackName: string;
  imported: number;
  skipped: number;
  driversNotFound: string[];
  insertErrors?: string[];
  stageWinners: Array<{ driver: string; s1: boolean; s2: boolean; s3: boolean }>;
  results: Array<{ position: number; driver: string; lapsLed: number; stages: string }>;
}

export default function ResultsImportPage() {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [selectedRaceNumber, setSelectedRaceNumber] = useState<number | ''>('');
  const [loadingRaces, setLoadingRaces] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ message: string; deleted: number } | null>(null);
  const [syncingDrivers, setSyncingDrivers] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; added: number; drivers?: string[] } | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<{ message: string; races_processed?: any[] } | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceResult, setAdvanceResult] = useState<{ message: string; nextRace?: any; seasonComplete?: boolean } | null>(null);

  // NASCAR Live Scraper state
  const [scrapeYear, setScrapeYear] = useState<number>(new Date().getFullYear());
  const [nascarRaces, setNascarRaces] = useState<NascarRace[]>([]);
  const [loadingNascarRaces, setLoadingNascarRaces] = useState(false);
  const [selectedNascarRaceId, setSelectedNascarRaceId] = useState<number | ''>('');
  const [selectedDbRaceId, setSelectedDbRaceId] = useState<string>('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

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

  // Auto-select season and load races when year changes
  useEffect(() => {
    if (selectedYear) {
      const matchingSeason = seasons.find(s => s.year === selectedYear);
      if (matchingSeason) {
        setSelectedSeasonId(matchingSeason.id);
        // Load races for this season
        loadRacesForSeason(matchingSeason.id);
      } else {
        // No matching season in database
        setSelectedSeasonId('');
        setRaces([]);
        setError(`No season found in database for year ${selectedYear}. Create a ${selectedYear} season in Admin → Seasons first.`);
      }
    } else {
      setRaces([]);
      setSelectedRaceNumber('');
      setSelectedSeasonId('');
    }
  }, [selectedYear, seasons]);

  const loadRacesForSeason = async (seasonId: string) => {
    setLoadingRaces(true);
    setSelectedRaceNumber('');
    setError(null);
    try {
      const res = await fetch(`/api/admin/races?seasonId=${seasonId}`);
      const data = await res.json();
      if (data.races) {
        setRaces(data.races);
        if (data.races.length === 0) {
          setError(`No races found for this season. Add races in Admin → Schedule Mgmt or Admin → Races first.`);
        }
      }
    } catch (err) {
      console.error('Failed to load races:', err);
      setRaces([]);
    } finally {
      setLoadingRaces(false);
    }
  };

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
      if (selectedRaceNumber) {
        body.raceNumber = selectedRaceNumber;
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
      // Reset post-import results when new import completes
      setRecalculateResult(null);
      setAdvanceResult(null);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculateScores = async () => {
    if (!selectedSeasonId) {
      setError('Please select a year first');
      return;
    }

    setRecalculating(true);
    setRecalculateResult(null);
    setError(null);

    try {
      const res = await fetch('/api/recalculate-season-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: selectedSeasonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Recalculation failed');
      }

      setRecalculateResult(data);
    } catch (err: any) {
      setError(err.message || 'Recalculation failed');
    } finally {
      setRecalculating(false);
    }
  };

  const handleAdvanceToNextRace = async () => {
    if (!selectedSeasonId) {
      setError('Please select a year first');
      return;
    }

    setAdvancing(true);
    setAdvanceResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/advance-race', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: selectedSeasonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Advance failed');
      }

      setAdvanceResult(data);
      // Reload races to show updated status
      if (selectedSeasonId) {
        loadRacesForSeason(selectedSeasonId);
      }
    } catch (err: any) {
      setError(err.message || 'Advance failed');
    } finally {
      setAdvancing(false);
    }
  };

  const handleFetchNascarSchedule = async () => {
    setLoadingNascarRaces(true);
    setScrapeError(null);
    setNascarRaces([]);
    setSelectedNascarRaceId('');

    try {
      const res = await fetch(`/api/admin/nascar-scrape?year=${scrapeYear}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch NASCAR schedule');
      }

      setNascarRaces(data.races || []);

      // Fetch seasons fresh every time to ensure we have current data
      let seasonsToSearch: Season[] = [];
      try {
        const seasonsRes = await fetch('/api/admin/seasons');
        const seasonsData = await seasonsRes.json();
        if (seasonsData.seasons) {
          seasonsToSearch = seasonsData.seasons;
          setSeasons(seasonsData.seasons);
        }
      } catch {
        // Fall back to pre-loaded state
        seasonsToSearch = seasons;
      }

      // Also load database races for this year so the "Import Into" dropdown works
      const matchingSeason = seasonsToSearch.find((s: Season) => s.year === scrapeYear);
      if (matchingSeason) {
        setSelectedSeasonId(matchingSeason.id);
        setSelectedYear(scrapeYear);
        // Load races directly here instead of relying on useEffect
        try {
          const racesRes = await fetch(`/api/admin/races?seasonId=${matchingSeason.id}`);
          const racesData = await racesRes.json();
          if (racesData.races && racesData.races.length > 0) {
            setRaces(racesData.races);
          } else {
            setRaces([]);
            setScrapeError(`Season "${matchingSeason.name}" found but has no races. Add races in Admin → Schedule Mgmt first.`);
          }
        } catch {
          setScrapeError('Failed to load database races.');
        }
      } else {
        setScrapeError(`NASCAR schedule loaded (${seasonsToSearch.length} seasons found), but none match year ${scrapeYear}. Create a ${scrapeYear} season in Admin → Seasons first.`);
      }
    } catch (err: any) {
      setScrapeError(err.message);
    } finally {
      setLoadingNascarRaces(false);
    }
  };

  const handleScrapeRace = async () => {
    if (!selectedNascarRaceId || !selectedDbRaceId) {
      setScrapeError('Please select both a NASCAR race and a database race to import into');
      return;
    }

    setScraping(true);
    setScrapeError(null);
    setScrapeResult(null);
    setRecalculateResult(null);
    setAdvanceResult(null);

    try {
      const res = await fetch('/api/admin/nascar-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: scrapeYear,
          nascarRaceId: selectedNascarRaceId,
          dbRaceId: selectedDbRaceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Scrape failed');
      }

      setScrapeResult(data);

      // Auto-detect the season for post-import actions
      const matchingSeason = seasons.find(s => s.year === scrapeYear);
      if (matchingSeason) {
        setSelectedSeasonId(matchingSeason.id);
        setSelectedYear(scrapeYear);
        loadRacesForSeason(matchingSeason.id);
      }
    } catch (err: any) {
      setScrapeError(err.message);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Import Race Results</h1>
        <p className="text-purple-400 mt-1">
          Import race results from NASCAR.com or from static JSON files
        </p>
      </div>

      {/* NASCAR Live Scraper - Primary Method */}
      <div className="glass rounded-xl p-6 border-2 border-amber-500/30">
        <h2 className="text-lg font-semibold text-amber-400 mb-2">Fetch from NASCAR.com</h2>
        <p className="text-purple-300 text-sm mb-4">
          Pull race results directly from NASCAR.com including finishing positions, laps led, and stage winners.
        </p>

        {/* Step 1: Load NASCAR schedule */}
        <div className="space-y-4">
          <div className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-purple-300 mb-2">Year</label>
              <input
                type="number"
                value={scrapeYear}
                onChange={(e) => setScrapeYear(Number(e.target.value))}
                className="w-32 px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              onClick={handleFetchNascarSchedule}
              disabled={loadingNascarRaces}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {loadingNascarRaces ? 'Loading...' : 'Load NASCAR Schedule'}
            </button>
          </div>

          {/* Step 2: Select NASCAR race and DB race */}
          {nascarRaces.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-purple-300 mb-2">
                  NASCAR.com Race
                </label>
                <select
                  value={selectedNascarRaceId}
                  onChange={(e) => setSelectedNascarRaceId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">Select a race from NASCAR.com...</option>
                  {nascarRaces.map((race) => (
                    <option key={race.race_id} value={race.race_id}>
                      {race.race_name} - {race.track_name} ({new Date(race.date).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-300 mb-2">
                  Import Into (Database Race)
                </label>
                <select
                  value={selectedDbRaceId}
                  onChange={(e) => setSelectedDbRaceId(e.target.value)}
                  disabled={races.length === 0}
                  className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
                >
                  <option value="">
                    {races.length === 0 ? 'Select a year above first to load DB races' : 'Select database race...'}
                  </option>
                  {races.map((race) => (
                    <option key={race.id} value={race.id}>
                      Race {race.race_number}: {race.name} {race.status === 'final' ? '(done)' : ''}
                    </option>
                  ))}
                </select>
                {races.length === 0 && (
                  <p className="text-purple-500 text-xs mt-1">
                    Click &quot;Load NASCAR Schedule&quot; above to load database races for the selected year.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Import button */}
          {nascarRaces.length > 0 && (
            <button
              onClick={handleScrapeRace}
              disabled={scraping || !selectedNascarRaceId || !selectedDbRaceId}
              className="px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-400 text-purple-900 font-bold rounded-lg hover:from-amber-300 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {scraping ? 'Fetching & Importing...' : 'Fetch Results & Import'}
            </button>
          )}
        </div>

        {/* Scrape Error */}
        {scrapeError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
            <p className="text-red-400">{scrapeError}</p>
          </div>
        )}

        {/* Scrape Results */}
        {scrapeResult && (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <h3 className="text-emerald-400 font-medium mb-2">
                Import Complete: {scrapeResult.raceName} at {scrapeResult.trackName}
              </h3>
              <div className="flex gap-6 text-sm">
                <span className="text-emerald-400">Imported: {scrapeResult.imported}</span>
                <span className="text-yellow-400">Skipped: {scrapeResult.skipped}</span>
              </div>
            </div>

            {/* Stage Winners */}
            {scrapeResult.stageWinners.length > 0 && (
              <div className="p-4 bg-purple-900/30 rounded-lg">
                <h4 className="text-purple-300 text-sm font-medium mb-2">Stage Winners</h4>
                <div className="flex flex-wrap gap-2">
                  {scrapeResult.stageWinners.map((sw, i) => (
                    <span key={i} className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-sm">
                      {sw.driver}: {[sw.s1 && 'S1', sw.s2 && 'S2', sw.s3 && 'S3'].filter(Boolean).join(', ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top 10 Preview */}
            {scrapeResult.results.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-purple-700/50">
                      <th className="text-left py-2 px-3 text-purple-400">Pos</th>
                      <th className="text-left py-2 px-3 text-purple-400">Driver</th>
                      <th className="text-right py-2 px-3 text-purple-400">Laps Led</th>
                      <th className="text-center py-2 px-3 text-purple-400">Stages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapeResult.results.map((r, i) => (
                      <tr key={i} className="border-b border-purple-800/30">
                        <td className="py-2 px-3 text-amber-400 font-bold">{r.position}</td>
                        <td className="py-2 px-3 text-white">{r.driver}</td>
                        <td className="py-2 px-3 text-right text-purple-300">{r.lapsLed}</td>
                        <td className="py-2 px-3 text-center text-amber-300">{r.stages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Drivers Not Found */}
            {scrapeResult.driversNotFound.length > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <h4 className="text-yellow-400 text-sm font-medium mb-2">Drivers not found in database:</h4>
                <div className="flex flex-wrap gap-2">
                  {scrapeResult.driversNotFound.map((d, i) => (
                    <span key={i} className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-sm">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Post-Import Actions */}
            <div className="p-4 bg-purple-900/30 rounded-lg space-y-3">
              <h4 className="text-amber-400 font-medium">Next Steps</h4>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleRecalculateScores}
                  disabled={recalculating || !selectedSeasonId}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50"
                >
                  {recalculating ? 'Recalculating...' : 'Recalculate Scores'}
                </button>
                <button
                  onClick={handleAdvanceToNextRace}
                  disabled={advancing || !selectedSeasonId}
                  className="px-4 py-2 bg-amber-500 text-purple-900 rounded-lg font-medium hover:bg-amber-400 disabled:opacity-50"
                >
                  {advancing ? 'Advancing...' : 'Open Next Race for Picks'}
                </button>
              </div>
              {recalculateResult && (
                <p className="text-emerald-400 text-sm">{recalculateResult.message}</p>
              )}
              {advanceResult && (
                <p className="text-emerald-400 text-sm">{advanceResult.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-4">
        <div className="flex-1 border-t border-purple-700/30"></div>
        <span className="text-purple-500 text-sm">OR import from static JSON files</span>
        <div className="flex-1 border-t border-purple-700/30"></div>
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
              {(syncResult as any).totalInJson !== undefined && (
                <div className="mt-2 text-xs text-purple-400">
                  <p>Drivers in JSON: {(syncResult as any).totalInJson}</p>
                  <p>Drivers in database: {(syncResult as any).totalInDatabase}</p>
                  <p>Missing count: {(syncResult as any).missingCount}</p>
                  {(syncResult as any).sampleDbDrivers?.length > 0 && (
                    <p className="mt-1">Sample DB drivers: {(syncResult as any).sampleDbDrivers.map((d: any) => `${d.name} → ${d.normalized}`).join(', ')}</p>
                  )}
                </div>
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
              Select Race (optional)
            </label>
            <select
              value={selectedRaceNumber}
              onChange={(e) => setSelectedRaceNumber(e.target.value ? Number(e.target.value) : '')}
              disabled={!selectedYear || loadingRaces}
              className="w-full px-4 py-3 bg-purple-900/30 border border-purple-700/50 rounded-lg text-white focus:outline-none focus:border-amber-400 disabled:opacity-50"
            >
              <option value="">
                {loadingRaces ? 'Loading races...' : 'All races (full season import)'}
              </option>
              {races.map((race) => (
                <option key={race.id} value={race.race_number}>
                  Race {race.race_number}: {race.name} {race.status === 'final' ? '✓' : ''}
                </option>
              ))}
            </select>
            <p className="text-purple-500 text-xs mt-1">
              Select a specific race to import, or leave as &quot;All races&quot; to import the entire season.
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
            {loading ? 'Importing...' : selectedRaceNumber ? 'Import Single Race' : 'Import Full Season'}
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

          {/* Post-Import Actions */}
          <div className="glass rounded-xl p-6 border-2 border-amber-500/30">
            <h2 className="text-lg font-semibold text-amber-400 mb-4">Next Steps</h2>
            <div className="space-y-4">
              {/* Step 2: Recalculate Scores */}
              <div className="flex items-center justify-between p-4 bg-purple-900/30 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Step 2: Recalculate Scores</h3>
                  <p className="text-purple-400 text-sm">Updates standings, driver usages, and all statistics</p>
                </div>
                <button
                  onClick={handleRecalculateScores}
                  disabled={recalculating || !selectedSeasonId}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {recalculating ? 'Recalculating...' : 'Recalculate All Scores'}
                </button>
              </div>

              {recalculateResult && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <p className="text-emerald-400 font-medium">{recalculateResult.message}</p>
                  {recalculateResult.races_processed && recalculateResult.races_processed.length > 0 && (
                    <p className="text-emerald-300 text-sm mt-1">
                      Processed: {recalculateResult.races_processed.map(r => `Race ${r.race_number}`).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Advance to Next Race */}
              <div className="flex items-center justify-between p-4 bg-purple-900/30 rounded-lg">
                <div>
                  <h3 className="text-white font-medium">Step 3: Advance to Next Race</h3>
                  <p className="text-purple-400 text-sm">Opens the next race for pick submissions</p>
                </div>
                <button
                  onClick={handleAdvanceToNextRace}
                  disabled={advancing || !selectedSeasonId}
                  className="px-4 py-2 bg-amber-500 text-purple-900 rounded-lg font-medium hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {advancing ? 'Advancing...' : 'Open Next Race for Picks'}
                </button>
              </div>

              {advanceResult && (
                <div className={`p-4 rounded-lg ${advanceResult.seasonComplete ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
                  <p className={advanceResult.seasonComplete ? 'text-blue-400 font-medium' : 'text-emerald-400 font-medium'}>
                    {advanceResult.message}
                  </p>
                  {advanceResult.nextRace && (
                    <p className="text-emerald-300 text-sm mt-1">
                      Race {advanceResult.nextRace.race_number}: {advanceResult.nextRace.name} is now open for picks
                    </p>
                  )}
                </div>
              )}
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
              <p className="text-purple-300 mt-1">
                <strong>Using admin client:</strong> {result.usingAdminClient ? 'Yes (bypasses RLS)' : 'No (using anon key)'}
              </p>
              {result.sampleDbDrivers && result.sampleDbDrivers.length > 0 && (
                <p className="text-purple-400 text-sm mt-2">
                  <strong>Sample normalized names:</strong> {result.sampleDbDrivers.join(', ')}
                </p>
              )}
              {result.insertErrors && result.insertErrors.length > 0 && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 font-medium mb-2">Insert Errors:</p>
                  {result.insertErrors.map((err, i) => (
                    <p key={i} className="text-red-300 text-sm">{err}</p>
                  ))}
                </div>
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
