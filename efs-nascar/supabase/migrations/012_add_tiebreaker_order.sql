-- Add tiebreaker_order to scoring_configs table
-- This allows configuring the order of tiebreakers for standings

ALTER TABLE public.scoring_configs
ADD COLUMN IF NOT EXISTS tiebreaker_order TEXT[] DEFAULT ARRAY['race_wins', 'stage_wins', 'laps_led', 'top_10_bonuses', 'allstar_position'];

COMMENT ON COLUMN public.scoring_configs.tiebreaker_order IS 'Order of tiebreakers: race_wins, stage_wins, laps_led, top_10_bonuses, allstar_position';
