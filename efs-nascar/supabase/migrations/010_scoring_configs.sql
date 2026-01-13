-- Scoring configurations table
-- Allows customizing scoring rules and playoff format per season

CREATE TABLE IF NOT EXISTS scoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,

  -- Position points (JSON object: {"1": 10, "2": 9, ...})
  position_points JSONB NOT NULL DEFAULT '{"1": 10, "2": 9, "3": 8, "4": 7, "5": 6, "6": 5, "7": 4, "8": 3, "9": 2, "10": 1}',

  -- Bonus points
  stage_win_bonus INTEGER NOT NULL DEFAULT 1,
  laps_led_bonus INTEGER NOT NULL DEFAULT 1,
  top_10_all_drivers_bonus INTEGER NOT NULL DEFAULT 1,

  -- Driver usage limits
  base_driver_uses INTEGER NOT NULL DEFAULT 4,
  bonus_uses_per_season INTEGER NOT NULL DEFAULT 1,

  -- Regular season configuration
  regular_season_races INTEGER NOT NULL DEFAULT 22,

  -- Playoff configuration
  playoff_enabled BOOLEAN NOT NULL DEFAULT true,
  championship_bracket_size INTEGER NOT NULL DEFAULT 7,
  catbird_seats INTEGER NOT NULL DEFAULT 2,
  consolation_bracket_start INTEGER NOT NULL DEFAULT 8,
  consolation_bracket_end INTEGER NOT NULL DEFAULT 15,
  muddy_mile_start INTEGER NOT NULL DEFAULT 16,
  muddy_mile_end INTEGER NOT NULL DEFAULT 17,

  -- Playoff round configuration (number of races per round)
  playoff_round1_races INTEGER NOT NULL DEFAULT 1,
  playoff_round2_races INTEGER NOT NULL DEFAULT 2,
  playoff_finals_races INTEGER NOT NULL DEFAULT 2,

  -- Elimination rules (teams eliminated per round)
  round1_eliminations INTEGER NOT NULL DEFAULT 1,
  round2_eliminations INTEGER NOT NULL DEFAULT 2,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(season_id)
);

-- Enable RLS
ALTER TABLE scoring_configs ENABLE ROW LEVEL SECURITY;

-- Everyone can read scoring configs
CREATE POLICY "Anyone can read scoring configs" ON scoring_configs
  FOR SELECT USING (true);

-- Only commissioners can manage scoring configs
CREATE POLICY "Commissioners can manage scoring configs" ON scoring_configs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_commissioner = true
    )
  );

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_scoring_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scoring_configs_updated_at
  BEFORE UPDATE ON scoring_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_scoring_configs_updated_at();

-- Insert default config for all existing seasons
INSERT INTO scoring_configs (season_id)
SELECT id FROM seasons
ON CONFLICT (season_id) DO NOTHING;
