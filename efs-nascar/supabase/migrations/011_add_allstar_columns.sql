-- Add allstar columns to team_season_bonuses table
-- These columns are used for tiebreaker logic

ALTER TABLE public.team_season_bonuses
ADD COLUMN IF NOT EXISTS allstar_position INTEGER,
ADD COLUMN IF NOT EXISTS allstar_points INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN public.team_season_bonuses.allstar_position IS 'All-Star race finish position (used as tiebreaker)';
COMMENT ON COLUMN public.team_season_bonuses.allstar_points IS 'All-Star race points (added to regular season total)';
