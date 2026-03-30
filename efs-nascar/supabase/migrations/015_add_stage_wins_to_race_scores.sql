-- Add stage_wins column to race_scores to track actual count of stage wins per race
-- Previously only stage_bonus (total bonus points) was stored, making it impossible
-- to distinguish 1 stage win from multiple stage wins during standings aggregation.

ALTER TABLE public.race_scores
ADD COLUMN IF NOT EXISTS stage_wins INTEGER DEFAULT 0;

COMMENT ON COLUMN public.race_scores.stage_wins IS 'Number of stage winners picked by this team in this race';

-- Backfill: since each stage bonus is 1 point, stage_bonus equals the stage win count
UPDATE public.race_scores SET stage_wins = stage_bonus WHERE stage_bonus > 0;
