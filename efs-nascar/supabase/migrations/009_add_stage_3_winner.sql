-- Add stage_3_winner column to race_results table
-- Some races like the Charlotte Coca-Cola 600 have 3 stages

ALTER TABLE public.race_results
ADD COLUMN IF NOT EXISTS stage_3_winner BOOLEAN DEFAULT FALSE;

-- Add comment explaining the column
COMMENT ON COLUMN public.race_results.stage_3_winner IS 'Whether this driver won Stage 3 (only applies to races with 3 stages, like the Coca-Cola 600)';
