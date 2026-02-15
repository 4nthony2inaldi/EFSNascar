'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Season, ScoringConfig, Team } from '@/types';

interface ScoringConfigWithSeason extends ScoringConfig {
  season: Season;
}

interface TeamBonus {
  id?: string;
  team_id: string;
  season_id: string;
  bonus_usages: number;
  allstar_position: number | null;
  allstar_points: number | null;
  notes: string | null;
  team?: Team;
}

// Generate default position points for P1-P40
const generateDefaultPositionPoints = (): Record<string, number> => {
  const points: Record<string, number> = {};
  // Default: P1=10, P2=9, ..., P10=1, P11-P40=0
  for (let i = 1; i <= 40; i++) {
    points[i.toString()] = i <= 10 ? 11 - i : 0;
  }
  return points;
};

const DEFAULT_POSITION_POINTS = generateDefaultPositionPoints();

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

  const [recalculating, setRecalculating] = useState(false);
  const [recalculateResult, setRecalculateResult] = useState<{ success: boolean; message: string } | null>(null);

  // Team bonus management
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamBonuses, setTeamBonuses] = useState<TeamBonus[]>([]);
  const [savingBonuses, setSavingBonuses] = useState(false);
  const [bonusSuccess, setBonusSuccess] = useState<string | null>(null);
  const [bonusError, setBonusError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Position points
    position_points: { ...DEFAULT_POSITION_POINTS },

    // Bonus points (separate values for each stage)
    stage_1_bonus: 1,
    stage_2_bonus: 1,
    stage_3_bonus: 1,
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

    // Playoff round configuration (0 = skip round)
    playoff_round1_races: 1,
    playoff_round2_races: 2,
    playoff_finals_races: 2,

    // Elimination rules
    round1_eliminations: 1,
    round2_eliminations: 2,

    // Tiebreaker order
    tiebreaker_order: ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'],
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

    // Load all teams
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .order('car_number', { ascending: true });

    setTeams((teamsData as Team[]) || []);
    setLoading(false);
  };

  // Load team bonuses for selected season
  const loadTeamBonuses = async (seasonId: string) => {
    const { data: bonusesData } = await supabase
      .from('team_season_bonuses')
      .select('*, team:teams(*)')
      .eq('season_id', seasonId);

    // Create a map of existing bonuses by team_id
    const bonusMap: Record<string, TeamBonus> = {};
    (bonusesData || []).forEach((b: any) => {
      bonusMap[b.team_id] = b;
    });

    // Create bonus entries for all teams (including those without records)
    const allTeamBonuses: TeamBonus[] = teams.map(team => {
      if (bonusMap[team.id]) {
        return bonusMap[team.id];
      }
      // Default values for teams without bonus records
      return {
        team_id: team.id,
        season_id: seasonId,
        bonus_usages: 1, // Default bonus uses
        allstar_position: null,
        allstar_points: null,
        notes: null,
        team: team,
      };
    });

    setTeamBonuses(allTeamBonuses);
  };

  const handleSelectSeason = async (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setError(null);
    setSuccess(null);
    setBonusError(null);
    setBonusSuccess(null);

    // Load team bonuses for this season
    await loadTeamBonuses(seasonId);

    // Find existing config for this season
    const existingConfig = configs.find(c => c.season_id === seasonId);

    if (existingConfig) {
      setEditingConfig(existingConfig);
      setFormData({
        position_points: existingConfig.position_points as Record<string, number>,
        stage_1_bonus: existingConfig.stage_1_bonus,
        stage_2_bonus: existingConfig.stage_2_bonus,
        stage_3_bonus: existingConfig.stage_3_bonus,
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
        tiebreaker_order: existingConfig.tiebreaker_order || ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'],
      });
    } else {
      setEditingConfig(null);
      // Reset to defaults
      setFormData({
        position_points: { ...DEFAULT_POSITION_POINTS },
        stage_1_bonus: 1,
        stage_2_bonus: 1,
        stage_3_bonus: 1,
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
        tiebreaker_order: ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'],
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
      stage_1_bonus: formData.stage_1_bonus,
      stage_2_bonus: formData.stage_2_bonus,
      stage_3_bonus: formData.stage_3_bonus,
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

  // Team bonus management functions
  const handleTeamBonusChange = (teamId: string, field: keyof TeamBonus, value: number | null) => {
    setTeamBonuses(prev => prev.map(bonus => {
      if (bonus.team_id === teamId) {
        return { ...bonus, [field]: value };
      }
      return bonus;
    }));
  };

  const saveTeamBonuses = async () => {
    if (!selectedSeasonId) return;

    setSavingBonuses(true);
    setBonusError(null);
    setBonusSuccess(null);

    try {
      for (const bonus of teamBonuses) {
        const bonusData = {
          team_id: bonus.team_id,
          season_id: selectedSeasonId,
          bonus_usages: bonus.bonus_usages,
          allstar_position: bonus.allstar_position,
          allstar_points: bonus.allstar_points,
          notes: bonus.notes,
        };

        if (bonus.id) {
          // Update existing
          const { error } = await supabase
            .from('team_season_bonuses')
            .update(bonusData)
            .eq('id', bonus.id);
          if (error) throw error;
        } else {
          // Insert new
          const { error } = await supabase
            .from('team_season_bonuses')
            .insert(bonusData);
          if (error) throw error;
        }
      }

      setBonusSuccess('Team bonuses saved successfully!');
      // Reload to get IDs for new records
      await loadTeamBonuses(selectedSeasonId);
    } catch (err) {
      setBonusError(err instanceof Error ? err.message : 'Failed to save team bonuses');
    } finally {
      setSavingBonuses(false);
    }
  };

  const copyFromSeason = async (sourceSeasonId: string) => {
    const sourceConfig = configs.find(c => c.season_id === sourceSeasonId);
    if (sourceConfig) {
      setFormData({
        position_points: sourceConfig.position_points as Record<string, number>,
        stage_1_bonus: sourceConfig.stage_1_bonus,
        stage_2_bonus: sourceConfig.stage_2_bonus,
        stage_3_bonus: sourceConfig.stage_3_bonus,
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
        tiebreaker_order: sourceConfig.tiebreaker_order || ['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'],
      });
      setSuccess('Configuration copied! Remember to save to apply changes.');
    }
  };

  const handleRecalculateScores = async () => {
    if (!selectedSeasonId) return;

    const confirmMessage = 'This will save the current configuration and recalculate all race scores for this season. This may take a moment. Continue?';
    if (!confirm(confirmMessage)) return;

    setRecalculating(true);
    setRecalculateResult(null);

    try {
      // Auto-save the current config before recalculating
      const configData = {
        season_id: selectedSeasonId,
        position_points: formData.position_points,
        stage_1_bonus: formData.stage_1_bonus,
        stage_2_bonus: formData.stage_2_bonus,
        stage_3_bonus: formData.stage_3_bonus,
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
        const { error: saveError } = await supabase
          .from('scoring_configs')
          .update(configData)
          .eq('id', editingConfig.id);
        if (saveError) throw new Error(`Failed to save config: ${saveError.message}`);
      } else {
        const { error: saveError } = await supabase
          .from('scoring_configs')
          .insert(configData);
        if (saveError) throw new Error(`Failed to save config: ${saveError.message}`);
      }

      // Reload configs so editingConfig is up to date
      await loadData();

      // Now recalculate using the saved config
      const response = await fetch('/api/recalculate-season-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: selectedSeasonId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to recalculate scores');
      }

      setRecalculateResult({
        success: true,
        message: data.message,
      });
      setSuccess('Configuration saved and scores recalculated!');
      setError(null);
    } catch (error) {
      setRecalculateResult({
        success: false,
        message: error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setRecalculating(false);
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
              <p className="text-sm text-purple-400 mb-4">Points awarded for each finishing position (P1-P40)</p>

              {/* P1-P10 */}
              <div className="mb-3">
                <div className="text-xs text-purple-500 mb-2">Positions 1-10</div>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((pos) => (
                    <div key={pos} className="text-center">
                      <div className="text-xs text-purple-400 mb-1">P{pos}</div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.position_points[pos.toString()] || 0}
                        onChange={(e) => handlePositionPointsChange(pos.toString(), parseInt(e.target.value) || 0)}
                        className="w-full px-1 py-1.5 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* P11-P20 */}
              <div className="mb-3">
                <div className="text-xs text-purple-500 mb-2">Positions 11-20</div>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 11).map((pos) => (
                    <div key={pos} className="text-center">
                      <div className="text-xs text-purple-400 mb-1">P{pos}</div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.position_points[pos.toString()] || 0}
                        onChange={(e) => handlePositionPointsChange(pos.toString(), parseInt(e.target.value) || 0)}
                        className="w-full px-1 py-1.5 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* P21-P30 */}
              <div className="mb-3">
                <div className="text-xs text-purple-500 mb-2">Positions 21-30</div>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 21).map((pos) => (
                    <div key={pos} className="text-center">
                      <div className="text-xs text-purple-400 mb-1">P{pos}</div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.position_points[pos.toString()] || 0}
                        onChange={(e) => handlePositionPointsChange(pos.toString(), parseInt(e.target.value) || 0)}
                        className="w-full px-1 py-1.5 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* P31-P40 */}
              <div>
                <div className="text-xs text-purple-500 mb-2">Positions 31-40</div>
                <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 31).map((pos) => (
                    <div key={pos} className="text-center">
                      <div className="text-xs text-purple-400 mb-1">P{pos}</div>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.position_points[pos.toString()] || 0}
                        onChange={(e) => handlePositionPointsChange(pos.toString(), parseInt(e.target.value) || 0)}
                        className="w-full px-1 py-1.5 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bonus Points */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Bonus Points</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Stage 1 Win</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.stage_1_bonus}
                    onChange={(e) => setFormData({ ...formData, stage_1_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Stage 2 Win</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.stage_2_bonus}
                    onChange={(e) => setFormData({ ...formData, stage_2_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Stage 3 Win</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.stage_3_bonus}
                    onChange={(e) => setFormData({ ...formData, stage_3_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">Most Laps Led</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.laps_led_bonus}
                    onChange={(e) => setFormData({ ...formData, laps_led_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-purple-200 mb-1">All 3 Top 10</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.top_10_all_drivers_bonus}
                    onChange={(e) => setFormData({ ...formData, top_10_all_drivers_bonus: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
              <p className="text-xs text-purple-500 mt-2">Points awarded for each type of bonus</p>
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
                    <p className="text-xs text-purple-400 mb-4">Set races to 0 to skip a round entirely (e.g., for simpler playoff formats)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 1 Races</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.playoff_round1_races}
                          onChange={(e) => setFormData({ ...formData, playoff_round1_races: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        {formData.playoff_round1_races === 0 && (
                          <p className="text-xs text-amber-400 mt-1">Round skipped</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Round 2 Races</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.playoff_round2_races}
                          onChange={(e) => setFormData({ ...formData, playoff_round2_races: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        {formData.playoff_round2_races === 0 && (
                          <p className="text-xs text-amber-400 mt-1">Round skipped</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-purple-200 mb-1">Finals Races</label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={formData.playoff_finals_races}
                          onChange={(e) => setFormData({ ...formData, playoff_finals_races: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 bg-[#1c1726] border border-purple-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        {formData.playoff_finals_races === 0 && (
                          <p className="text-xs text-amber-400 mt-1">Round skipped</p>
                        )}
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

            {/* Tiebreaker Order */}
            <div>
              <h4 className="text-md font-bold text-amber-400 mb-3">Tiebreaker Order</h4>
              <p className="text-sm text-purple-400 mb-4">
                Configure the order of tiebreakers used when teams have equal points. Use arrows to reorder.
              </p>
              <div className="space-y-2">
                {formData.tiebreaker_order.map((tiebreaker, index) => {
                  const labels: Record<string, string> = {
                    race_wins: 'Most race winners picked',
                    stage_wins: 'Most stage winners picked',
                    laps_led: 'Most laps led picked',
                    top_10_bonuses: 'Most "all 3 in top 10" bonuses',
                    allstar_position: 'All-Star race finish position',
                  };
                  return (
                    <div key={tiebreaker} className="flex items-center gap-3 p-3 bg-purple-900/30 rounded-lg border border-purple-700/30">
                      <span className="text-amber-400 font-bold w-6">{index + 1}.</span>
                      <span className="flex-1 text-purple-200">{labels[tiebreaker] || tiebreaker}</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (index > 0) {
                              const newOrder = [...formData.tiebreaker_order];
                              [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                              setFormData({ ...formData, tiebreaker_order: newOrder });
                            }
                          }}
                          disabled={index === 0}
                          className="p-1.5 rounded bg-purple-700/30 text-purple-300 hover:bg-purple-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (index < formData.tiebreaker_order.length - 1) {
                              const newOrder = [...formData.tiebreaker_order];
                              [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                              setFormData({ ...formData, tiebreaker_order: newOrder });
                            }
                          }}
                          disabled={index === formData.tiebreaker_order.length - 1}
                          className="p-1.5 rounded bg-purple-700/30 text-purple-300 hover:bg-purple-700/50 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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

          {/* Recalculate Scores Section */}
          <div className="mt-8 pt-6 border-t border-purple-700/30">
            <h4 className="text-md font-bold text-amber-400 mb-3">Recalculate Scores</h4>
            <p className="text-sm text-purple-400 mb-4">
              After saving your configuration changes, you can recalculate all race scores for this season
              to apply the new scoring rules to historical data.
            </p>

            {recalculateResult && (
              <div className={`px-4 py-3 rounded-lg mb-4 ${
                recalculateResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/50 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/50 text-red-400'
              }`}>
                {recalculateResult.message}
              </div>
            )}

            <button
              type="button"
              onClick={handleRecalculateScores}
              disabled={recalculating}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {recalculating ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Recalculating...
                </span>
              ) : (
                'Recalculate All Scores for This Season'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Team Bonus & All-Star Management */}
      {showForm && selectedSeason && teamBonuses.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-2">Team Bonus Picks & All-Star Results</h3>
          <p className="text-sm text-purple-400 mb-4">
            Manage bonus driver picks per team and record All-Star exhibition results (used for tiebreakers)
          </p>

          {bonusError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-4">
              {bonusError}
            </div>
          )}

          {bonusSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 px-4 py-3 rounded-lg mb-4">
              {bonusSuccess}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-purple-900/30 text-left text-purple-300 text-sm">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2 text-center">Bonus Picks</th>
                  <th className="px-3 py-2 text-center">All-Star Position</th>
                  <th className="px-3 py-2 text-center">All-Star Points</th>
                </tr>
              </thead>
              <tbody>
                {teamBonuses
                  .sort((a, b) => (a.team?.car_number || 0) - (b.team?.car_number || 0))
                  .map((bonus) => (
                  <tr key={bonus.team_id} className="border-b border-purple-800/30">
                    <td className="px-3 py-2 text-amber-400 font-bold">
                      {bonus.team?.car_number}
                    </td>
                    <td className="px-3 py-2 text-white">
                      {bonus.team?.name || 'Unknown'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={bonus.bonus_usages}
                        onChange={(e) => handleTeamBonusChange(bonus.team_id, 'bonus_usages', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={bonus.allstar_position || ''}
                        placeholder="-"
                        onChange={(e) => handleTeamBonusChange(bonus.team_id, 'allstar_position', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-20 px-2 py-1 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={bonus.allstar_points || ''}
                        placeholder="-"
                        onChange={(e) => handleTeamBonusChange(bonus.team_id, 'allstar_points', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-20 px-2 py-1 bg-[#1c1726] border border-purple-700/50 rounded text-white text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-purple-700/30 flex items-center justify-between">
            <p className="text-xs text-purple-500">
              All-Star position is the final tiebreaker. All-Star points are added to regular season total.
            </p>
            <button
              type="button"
              onClick={saveTeamBonuses}
              disabled={savingBonuses}
              className="px-6 py-2 rounded-lg text-sm font-bold text-purple-900 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:via-yellow-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50"
            >
              {savingBonuses ? 'Saving...' : 'Save Team Bonuses'}
            </button>
          </div>
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
                      S1:{config.stage_1_bonus} S2:{config.stage_2_bonus} S3:{config.stage_3_bonus} Laps:{config.laps_led_bonus} T10:{config.top_10_all_drivers_bonus}
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
