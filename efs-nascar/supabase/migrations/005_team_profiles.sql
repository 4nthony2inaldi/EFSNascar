-- Add team profile fields
-- Run this in Supabase SQL Editor

-- Add new columns to teams table
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS owner_headshot_url TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS favorite_driver_id UUID REFERENCES public.drivers(id);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS quote TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS bio TEXT;

-- Create index for favorite driver lookup
CREATE INDEX IF NOT EXISTS idx_teams_favorite_driver ON public.teams(favorite_driver_id);

-- Add policy for team owners to update their team profile
CREATE POLICY "Team owners can update their team profile" ON public.teams FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = teams.id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = teams.id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
        )
    );

-- Create storage bucket for team images (run in Storage section or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('team-images', 'team-images', true);

-- Storage policies (run after bucket is created)
-- CREATE POLICY "Team owners can upload team images" ON storage.objects FOR INSERT
--     WITH CHECK (
--         bucket_id = 'team-images' AND
--         EXISTS (
--             SELECT 1 FROM public.team_memberships tm
--             WHERE tm.user_id = auth.uid()
--             AND tm.role = 'owner'
--         )
--     );

-- CREATE POLICY "Anyone can view team images" ON storage.objects FOR SELECT
--     USING (bucket_id = 'team-images');
