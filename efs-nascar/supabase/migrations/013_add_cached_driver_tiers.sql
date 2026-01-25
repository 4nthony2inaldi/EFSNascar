-- Create table for caching driver tier calculations
-- This avoids expensive recalculations on every page load

CREATE TABLE IF NOT EXISTS public.cached_driver_tiers (
  id TEXT PRIMARY KEY DEFAULT 'current',
  tiers_data JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow all authenticated users to read cached tiers
ALTER TABLE public.cached_driver_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached tiers"
  ON public.cached_driver_tiers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage cached tiers"
  ON public.cached_driver_tiers
  FOR ALL
  TO service_role
  USING (true);

-- Allow authenticated users to upsert (for server-side caching)
CREATE POLICY "Authenticated users can upsert cached tiers"
  ON public.cached_driver_tiers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cached tiers"
  ON public.cached_driver_tiers
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete cached tiers"
  ON public.cached_driver_tiers
  FOR DELETE
  TO authenticated
  USING (true);

COMMENT ON TABLE public.cached_driver_tiers IS 'Cached driver tier calculations to improve performance';
