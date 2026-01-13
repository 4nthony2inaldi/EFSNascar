'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Season, ScoringConfig } from '@/types';

interface ScoringConfigWithSeason extends ScoringConfig {
  season: Season;
}

const DEFAULT_POSITION_POINTS: Record<string, number> = {
  '1': 10, '2': 9, '3': 8, '4': 7, '5': 6,
  '6': 5, '7': 4, '8': 3, '9': 2, '10': 1,
};

export default function AdminScoringPage() {
  const supabase = createClient();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [configs, setConfigs] = useState<ScoringConfigWithSeason[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<ScoringConfig | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Position points
    position_points: { ...DEFAULT_POSITION_POINTS },

    // Bonus points
    stage_win_bonus: 1,
    laps_led_bonus: 1,
    top_10_all_drivers_bonus: 1,

    // Driver usage limits
    base_driver_uses: 4,
    bonus_uses_per_season: 1,

    // Regular season configuration
    regular_season_races: 22,

    // Playoff configuration
    playoff_enabled: true,
    championship_bracket_size: 7,
    catbird_seats: 2,
    consolation_bracket_start: 8,
    consolation_bracket_end: 15,
    muddy_mile_start: 16,
    muddy_mile_end: 17,

    // Playoff round configuration
    playoff_round1_races: 1,
    playoff_round2_races: 2,
    playoff_finals_races: 2,

    // Elimination rules
    round1_eliminations: 1,
    round2_eliminations: 2,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    // Load seasons
    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .order('year', { ascending: false });

    setSeasons(seasonsData || []);

    // Load scoring configs with season info
    const { data: configsData } = await supabase
      .from('scoring_configs')
      .select('*, season:seasons(*)')
      .order('season(year)', { ascending: false });

    setConfigs((configsData as ScoringConfigWithSeason[]) || []);
    setLoading(false);
  };

  const handleSelectSeason = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setError(null);
    setSuccess(null);

    // Find existing config for this season
    const existingConfig = configs.find(c => c.season_id === seasonId);

    if (existingConfig) {
      setEditingConfig(existingConfig);
      setFormData({
        position_points: existingConfig.position_points as Record<string, number>,
        stage_win_bonus: existingConfig.stage_win_bonus,
        laps_led_bonus: existingConfig.laps_led_bonus,
        top_10_all_drivers_bonus: existingConfig.top_10_all_drivers_bonus,
        base_driver_uses: existingConfig.base_driver_uses,
        bonus_uses_per_season: existingConfig.bonus_uses_per_season,
        regular_season_races: existingConfig.regular_season_races,
        playoff_enabled: existingConfig.playoff_enabled,
        championship_bracket_size: existingConfig.championship_bracket_size,
        catbird_seats: existingConfig.catbird_seats,
        consolation_bracket_start: existingConfig.consolation_bracket_start,
        consolation_bracket_end: existingConfig.consolation_bracket_end,
        muddy_mile_start: existingConfig.muddy_mile_start,
        muddy_mile_end: existingConfig.muddy_mile_end,
        playoff_round1_races: existingConfig.playoff_round1_races,
        playoff_round2_races: existingConfig.playoff_round2_races,
        playoff_finals_races: existingConfig.playoff_finals_races,
        round1_eliminations: existingConfig.round1_eliminations,
        round2_eliminations: existingConfig.round2_eliminations,
      });
    } else {
      setEditingConfig(null);
      // Reset to defaults
      setFormData({
        position_points: { ...DEFAULT_POSITION_POINTS },
        stage_win_bonus: 1,
        laps_led_bonus: 1,
        top_10_all_drivers_bonus: 1,
        base_driver_uses: 4,
        bonus_uses_per_season: 1,
        regular_season_races: 22,
        playoff_enabled: true,
        championship_bracket_size: 7,
        catbird_seats: 2,
        consolation_bracket_start: 8,
        consolation_bracket_end: 15,
        muddy_mile_start: 16,
        muddy_mile_end: 17,
        playoff_round1_races: 1,
        playoff_round2_races: 2,
        playoff_finals_races: 2,
        round1_eliminations: 1,
        round2_eliminations: 2,
      });
    }

    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSeasonId) {
      setError('No season selected');
      return;
    }

    const configData = {
      season_id: selectedSeasonId,
      position_points: formData.position_points,
      stage_win_bonus: formData.stage_win_bonus,
      laps_led_bonus: formData.laps_led_bonus,
      top_10_all_drivers_bonus: formData.top_10_all_drivers_bonus,
      base_driver_uses: formData.base_driver_uses,
      bonus_uses_per_season: formData.bonus_uses_per_season,
      regular_season_races: formData.regular_season_races,
      playoff_enabled: formData.playoff_enabled,
      championship_bracket_size: formData.championship_bracket_size,
      catbird_seats: formData.catbird_seats,
      consolation_bracket_start: formData.consolation_bracket_start,
      consolation_bracket_end: formData.consolation_bracket_end,
      muddy_mile_start: formData.muddy_mile_start,
      muddy_mile_end: formData.muddy_mile_end,
      playoff_round1_races: formData.playoff_round1_races,
      playoff_round2_races: formData.playoff_round2_races,
      playoff_finals_races: formData.playoff_finals_races,
      round1_eliminations: formData.round1_eliminations,
      round2_eliminations: formData.round2_eliminations,
    };

    if (editingConfig) {
      const { error } = await supabase
        .from('scoring_configs')
        .update(configData)
        .eq('id', editingConfig.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('scoring_configs')
        .insert(configData);

      if (error) {
        setError(error.message);
        return;
      }
    }

    setSuccess('Scoring configuration saved successfully!');
    loadData();
  };

  const handlePositionPointsChange = (position: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      position_points: {
        ...prev.position_points,
        [position]: value,
      },
    }));
  };

  const copyFromSeason = async (sourceSeasonId: string) => {
    const sourceConfig = configs.find(c => c.season_id === sourceSeasonId);
    if (sourceConfig) {
      setFormData({
        position_points: sourceConfig.position_points as Record<string, number>,
        stage_win_bonus: sourceConfig.stage_win_bonus,
        laps_led_bonus: sourceConfig.laps_led_bonus,
        top_10_all_drivers_bonus: sourceConfig.top_10_all_drivers_bonus,
        base_driver_uses: sourceConfig.base_driver_uses,
        bonus_uses_per_season: sourceConfig.bonus_uses_per_season,
        regular_season_races: sourceConfig.regular_season_races,
        playoff_enabled: sourceConfig.playoff_enabled,
        championship_bracket_size: sourceConfig.championship_bracket_size,
        catbird_seats: sourceConfig.catbird_seats,
        consolation_bracket_start: sourceConfig.consolation_bracket_start,
        consolation_bracket_end: sourceConfig.consolation_bracket_end,
        muddy_mile_start: sourceConfig.muddy_mile_start,
        muddy_mile_end: sourceConfig.muddy_mile_end,
        playoff_round1_races: sourceConfig.playoff_round1_races,
        playoff_round2_races: sourceConfig.playoff_round2_races,
        playoff_finals_races: sourceConfig.playoff_finals_races,
        round1_eliminations: sourceConfig.round1_eliminations,
        round2_eliminations: sourceConfig.round2_eliminations,
      });
      setSuccess('Configuration copied! Remember to save to apply changes.');
    }
  };

  if (loading) {
    return <div className="text-purple-400">Loading...</div>;
  }

  const selectedSeason = seasons.find(s => s.id === selectedSeasonId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Scoring Configuration</h2>
          <p className="text-purple-400 text-sm">Configure scoring rules and playoff formats per season</p>
        </div>
      </div>

      {/* Season Selection */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Select Season to Configure</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {seasons.map((season) => {
            const hasConfig = configs.some(c => c.season_id === season.id);
            const isSelected = selectedSeasonId === season.id;
            return (
              <button
                key={season.id}
                onClick={() => handleSelectSeason(season.id)}
                className={`p-3 rounded-lg text-sm font-medium transition-all border ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-purple-900 border-amber-400'
                    : hasConfig
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                    : 'bg-purple-900/30 text-purple-200 border-purple-700/30 hover:bg-purple-800/40'
                }`}
              >
                <div className="font-bold">{season.year}</div>
                <div className="text-xs opacity-75">
                  {hasConfig ? 'Configured' : 'Default'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Configuration Form */}
      {showForm && selectedSeason && (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">
              {selectedSeason.year} Season Configuration
              {editingConfig && (
                <span className="ml-2 text-sm text-emerald-400 font-normal">(Editing existing)</span>
              )}
            </h3>

            {/* Copy from another season */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-purple-400">Copy from:</span>
              <select
                className="px-3 py-1 bg-purple-900/50 border border-purple-700/50 rounded text-purple-200 text-sm"
                onChange={(e) => e.target.value && copyFromSeason(e.target.value)}
                value=""
              >
                <option value="">Select season...</option>
                {configs.filter(c => c.season_id !== selectedSeasonId).map((config) => (
                  <option key={config.season_id} value={config.season_id}>
                    {config.season.year} Season
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Position Points */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Position Points</h4>
              <p className="text-sm text-purple-400 mb-4">Points awarded for each finishing position</p>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pos) => (
                  <div key={pos} className="text-center">
                    <div className="text-xs text-purple-400 mb-1">P{pos}</div>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.position_points[pos.toString()] || 0}
                      onChange={(e) => handlePositionPointsChange(pos.toString(), parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Bonus Points */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Bonus Points</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Stage Win Bonus</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.stage_win_bonus}
                    onChange={(e) => setFormData({ ...formData, stage_win_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Points per stage win</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Most Laps Led Bonus</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.laps_led_bonus}
                    onChange={(e) => setFormData({ ...formData, laps_led_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Points for most laps led</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">All 3 Drivers Top 10</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.top_10_all_drivers_bonus}
                    onChange={(e) => setFormData({ ...formData, top_10_all_drivers_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Bonus when all 3 finish top 10</p>
                </div>
              </div>
            </div>

            {/* Driver Usage */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Driver Usage Limits</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Base Driver Uses</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.base_driver_uses}
                    onChange={(e) => setFormData({ ...formData, base_driver_uses: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Times each driver can be used</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Bonus Uses Per Season</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.bonus_uses_per_season}
                    onChange={(e) => setFormData({ ...formData, bonus_uses_per_season: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Extra uses available per season</p>
                </div>
              </div>
            </div>

            {/* Regular Season */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Regular Season</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Regular Season Races</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.regular_season_races}
                    onChange={(e) => setFormData({ ...formData, regular_season_races: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-purple-500 mt-1">Number of races before playoffs</p>
                </div>
              </div>
            </div>

            {/* Playoff Configuration */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-md font-bold text-amber-400">Playoff Configuration</h4>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.playoff_enabled}
                    onChange={(e) => setFormData({ ...formData, playoff_enabled: e.target.checked })}
                    className="accent-amber-400"
                  />
                  <span className="text-purple-200 text-sm">Enable Playoffs</span>
                </label>
              </div>

              {formData.playoff_enabled && (
                <>
                  {/* Championship Bracket */}
                  <div className="bg-purple-900/20 rounded-lg p-4 mb-4 border border-purple-700/30">
                    <h5 className="text-sm font-bold text-white mb-3">Championship Bracket</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Total Teams</label>
                        <input
                          type="number"
                          min="2"
                          max="20"
                          value={formData.championship_bracket_size}
                          onChange={(e) => setFormData({ ...formData, championship_bracket_size: parseInt(e.target.value) || 2 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-purple-500 mt-1">Teams competing for championship</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Catbird Seats (Byes)</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.catbird_seats}
                          onChange={(e) => setFormData({ ...formData, catbird_seats: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-purple-500 mt-1">Top seeds with round 1 bye</p>
                      </div>
                    </div>
                  </div>

                  {/* Consolation Bracket */}
                  <div className="bg-purple-900/20 rounded-lg p-4 mb-4 border border-purple-700/30">
                    <h5 className="text-sm font-bold text-white mb-3">Consolation Bracket</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Starting Seed</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.consolation_bracket_start}
                          onChange={(e) => setFormData({ ...formData, consolation_bracket_start: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Ending Seed</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.consolation_bracket_end}
                          onChange={(e) => setFormData({ ...formData, consolation_bracket_end: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-purple-500 mt-2">Seeds {formData.consolation_bracket_start}-{formData.consolation_bracket_end} + eliminated championship teams</p>
                  </div>

                  {/* Muddy Mile */}
                  <div className="bg-purple-900/20 rounded-lg p-4 mb-4 border border-purple-700/30">
                    <h5 className="text-sm font-bold text-white mb-3">Muddy Mile</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Starting Seed</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.muddy_mile_start}
                          onChange={(e) => setFormData({ ...formData, muddy_mile_start: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Ending Seed</label>
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={formData.muddy_mile_end}
                          onChange={(e) => setFormData({ ...formData, muddy_mile_end: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-purple-500 mt-2">Seeds {formData.muddy_mile_start}-{formData.muddy_mile_end}</p>
                  </div>

                  {/* Playoff Rounds */}
                  <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-700/30">
                    <h5 className="text-sm font-bold text-white mb-3">Playoff Round Structure</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 1 Races</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={formData.playoff_round1_races}
                          onChange={(e) => setFormData({ ...formData, playoff_round1_races: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 2 Races</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={formData.playoff_round2_races}
                          onChange={(e) => setFormData({ ...formData, playoff_round2_races: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Finals Races</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={formData.playoff_finals_races}
                          onChange={(e) => setFormData({ ...formData, playoff_finals_races: parseInt(e.target.value) || 1 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 1 Eliminations</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.round1_eliminations}
                          onChange={(e) => setFormData({ ...formData, round1_eliminations: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-purple-500 mt-1">Teams eliminated after round 1</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 2 Eliminations</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.round2_eliminations}
                          onChange={(e) => setFormData({ ...formData, round2_eliminations: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-xs text-purple-500 mt-1">Teams eliminated after round 2</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="flex space-x-4 pt-4 border-t border-purple-700/30">
              <button
                type="submit"
                className="px-6 py-3 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all"
              >
                Save Configuration
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedSeasonId(null);
                  setEditingConfig(null);
                }}
                className="px-6 py-3 bg-purple-700/30 text-purple-200 rounded-lg hover:bg-purple-700/50 transition-colors border border-purple-600/30"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Configurations List */}
      <div className="glass rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">Configured Seasons</h3>
        {configs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                  <th className="px-4 py-3">Season</th>
                  <th className="px-4 py-3">Position Points</th>
                  <th className="px-4 py-3">Bonuses</th>
                  <th className="px-4 py-3">Driver Uses</th>
                  <th className="px-4 py-3">Playoffs</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr
                    key={config.id}
                    className="border-b border-purple-800/30 hover:bg-purple-900/20 cursor-pointer"
                    onClick={() => handleSelectSeason(config.season_id)}
                  >
                    <td className="px-4 py-3 text-white font-bold">{config.season.year}</td>
                    <td className="px-4 py-3 text-purple-300 text-sm">
                      P1:{config.position_points['1']} P2:{config.position_points['2']} P3:{config.position_points['3']}...
                    </td>
                    <td className="px-4 py-3 text-purple-300 text-sm">
                      Stage:{config.stage_win_bonus} Laps:{config.laps_led_bonus} T10:{config.top_10_all_drivers_bonus}
                    </td>
                    <td className="px-4 py-3 text-purple-300 text-sm">
                      {config.base_driver_uses} (+{config.bonus_uses_per_season})
                    </td>
                    <td className="px-4 py-3">
                      {config.playoff_enabled ? (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded border border-emerald-500/30">
                          Enabled
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-purple-700/30 text-purple-300 text-xs rounded border border-purple-600/30">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-purple-400 text-sm">
                      {new Date(config.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-purple-400">
            No scoring configurations created yet. Select a season above to configure.
          </div>
        )}
      </div>
    </div>
  );
}
