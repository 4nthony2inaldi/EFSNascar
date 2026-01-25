-- Championship prediction picks
-- Each team picks one driver they predict will win the real NASCAR championship
-- Picks are hidden until commissioner reveals them

CREATE TABLE IF NOT EXISTS public.championship_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, season_id)
);

-- Track whether predictions are revealed for a season
ALTER TABLE public.seasons
ADD COLUMN IF NOT EXISTS championship_predictions_revealed BOOLEAN DEFAULT FALSE;

-- RLS policies
ALTER TABLE public.championship_predictions ENABLE ROW LEVEL SECURITY;

-- Teams can only see their own predictions (until revealed via season flag)
CREATE POLICY "Teams can view own predictions"
  ON public.championship_predictions
  FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.team_memberships
      WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.seasons s
      WHERE s.id = season_id AND s.championship_predictions_revealed = true
    )
  );

-- Teams can insert their own predictions
CREATE POLICY "Teams can insert own predictions"
  ON public.championship_predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.team_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Teams can update their own predictions (before reveal)
CREATE POLICY "Teams can update own predictions before reveal"
  ON public.championship_predictions
  FOR UPDATE
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.team_memberships
      WHERE user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.seasons s
      WHERE s.id = season_id AND s.championship_predictions_revealed = true
    )
  );

-- Teams can delete their own predictions (before reveal)
CREATE POLICY "Teams can delete own predictions before reveal"
  ON public.championship_predictions
  FOR DELETE
  TO authenticated
  USING (
    team_id IN (
      SELECT team_id FROM public.team_memberships
      WHERE user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.seasons s
      WHERE s.id = season_id AND s.championship_predictions_revealed = true
    )
  );

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_championship_predictions_season
  ON public.championship_predictions(season_id);
CREATE INDEX IF NOT EXISTS idx_championship_predictions_team
  ON public.championship_predictions(team_id);

COMMENT ON TABLE public.championship_predictions IS 'Preseason championship winner predictions by teams';
COMMENT ON COLUMN public.seasons.championship_predictions_revealed IS 'Whether championship predictions are visible to all teams';
