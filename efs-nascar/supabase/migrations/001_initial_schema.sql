-- EFS NASCAR Fantasy League Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    is_commissioner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAMS
-- ============================================
CREATE TABLE public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    car_number INTEGER NOT NULL UNIQUE CHECK (car_number >= 1 AND car_number <= 99),
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAM MEMBERSHIPS
-- ============================================
CREATE TYPE public.team_role AS ENUM ('member', 'owner');

CREATE TABLE public.team_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    role team_role NOT NULL DEFAULT 'member',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    UNIQUE(user_id, team_id)
);

-- ============================================
-- SEASONS
-- ============================================
CREATE TABLE public.seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAM SEASON BONUSES
-- ============================================
CREATE TABLE public.team_season_bonuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    bonus_usages INTEGER DEFAULT 1, -- Default 1 bonus 5th use
    notes TEXT,
    UNIQUE(team_id, season_id)
);

-- ============================================
-- RACES
-- ============================================
CREATE TYPE public.race_status AS ENUM ('upcoming', 'in_progress', 'final');
CREATE TYPE public.race_type AS ENUM ('regular', 'playoff_round1', 'playoff_round2', 'playoff_finals', 'exhibition');

CREATE TABLE public.races (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    race_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    track TEXT NOT NULL,
    scheduled_datetime TIMESTAMPTZ NOT NULL,
    deadline_datetime TIMESTAMPTZ NOT NULL,
    race_type race_type DEFAULT 'regular',
    status race_status DEFAULT 'upcoming',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, race_number)
);

-- ============================================
-- DRIVERS
-- ============================================
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    car_number INTEGER NOT NULL,
    team_name TEXT, -- NASCAR team (not fantasy team)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RACE RESULTS
-- ============================================
CREATE TABLE public.race_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    finish_position INTEGER NOT NULL CHECK (finish_position >= 1),
    stage_1_winner BOOLEAN DEFAULT FALSE,
    stage_2_winner BOOLEAN DEFAULT FALSE,
    laps_led INTEGER DEFAULT 0,
    most_laps_led BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(race_id, driver_id),
    UNIQUE(race_id, finish_position)
);

-- ============================================
-- PICKS
-- ============================================
CREATE TABLE public.picks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
    driver_1_id UUID NOT NULL REFERENCES public.drivers(id),
    driver_2_id UUID NOT NULL REFERENCES public.drivers(id),
    driver_3_id UUID NOT NULL REFERENCES public.drivers(id),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, race_id),
    CHECK (driver_1_id != driver_2_id AND driver_1_id != driver_3_id AND driver_2_id != driver_3_id)
);

-- ============================================
-- DRIVER USAGES (Tracking per season)
-- ============================================
CREATE TABLE public.driver_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    times_used INTEGER DEFAULT 0,
    UNIQUE(team_id, season_id, driver_id)
);

-- ============================================
-- STANDINGS (Computed/cached per race)
-- ============================================
CREATE TABLE public.standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    race_id UUID REFERENCES public.races(id) ON DELETE CASCADE, -- NULL means season total
    total_points INTEGER DEFAULT 0,
    race_wins INTEGER DEFAULT 0, -- Number of race winners picked
    stage_wins INTEGER DEFAULT 0, -- Number of stage winners picked
    top_10_bonuses INTEGER DEFAULT 0, -- All 3 in top 10 bonuses
    rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, season_id, race_id)
);

-- ============================================
-- RACE SCORES (Points per team per race)
-- ============================================
CREATE TABLE public.race_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
    driver_1_points INTEGER DEFAULT 0,
    driver_2_points INTEGER DEFAULT 0,
    driver_3_points INTEGER DEFAULT 0,
    stage_bonus INTEGER DEFAULT 0,
    laps_led_bonus INTEGER DEFAULT 0,
    top_10_bonus INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, race_id)
);

-- ============================================
-- ANNOUNCEMENTS
-- ============================================
CREATE TABLE public.announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES public.profiles(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES for performance
-- ============================================
CREATE INDEX idx_team_memberships_user ON public.team_memberships(user_id);
CREATE INDEX idx_team_memberships_team ON public.team_memberships(team_id);
CREATE INDEX idx_races_season ON public.races(season_id);
CREATE INDEX idx_races_status ON public.races(status);
CREATE INDEX idx_race_results_race ON public.race_results(race_id);
CREATE INDEX idx_picks_team ON public.picks(team_id);
CREATE INDEX idx_picks_race ON public.picks(race_id);
CREATE INDEX idx_driver_usages_team_season ON public.driver_usages(team_id, season_id);
CREATE INDEX idx_standings_season ON public.standings(season_id);
CREATE INDEX idx_race_scores_race ON public.race_scores(race_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_season_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read all, update own
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Teams: Everyone can read
CREATE POLICY "Teams are viewable by everyone" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage teams" ON public.teams FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Team Memberships: Everyone can read, members can manage their team
CREATE POLICY "Memberships are viewable by everyone" ON public.team_memberships FOR SELECT USING (true);
CREATE POLICY "Team owners can manage memberships" ON public.team_memberships FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.team_memberships tm
            WHERE tm.team_id = team_memberships.team_id
            AND tm.user_id = auth.uid()
            AND tm.role = 'owner'
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true)
    );

-- Seasons: Everyone can read, commissioners can manage
CREATE POLICY "Seasons are viewable by everyone" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage seasons" ON public.seasons FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Team Season Bonuses: Everyone can read, commissioners can manage
CREATE POLICY "Bonuses are viewable by everyone" ON public.team_season_bonuses FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage bonuses" ON public.team_season_bonuses FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Races: Everyone can read, commissioners can manage
CREATE POLICY "Races are viewable by everyone" ON public.races FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage races" ON public.races FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Drivers: Everyone can read, commissioners can manage
CREATE POLICY "Drivers are viewable by everyone" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage drivers" ON public.drivers FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Race Results: Everyone can read, commissioners can manage
CREATE POLICY "Results are viewable by everyone" ON public.race_results FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage results" ON public.race_results FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Picks: Complex visibility rules
-- Before deadline: only own team can see
-- After deadline OR all teams submitted: everyone can see
CREATE POLICY "Own picks always visible" ON public.picks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.team_memberships
            WHERE team_memberships.team_id = picks.team_id
            AND team_memberships.user_id = auth.uid()
        )
    );

CREATE POLICY "Picks visible after deadline" ON public.picks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.races
            WHERE races.id = picks.race_id
            AND (races.deadline_datetime < NOW() OR races.status != 'upcoming')
        )
    );

CREATE POLICY "Team members can submit picks" ON public.picks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.team_memberships
            WHERE team_memberships.team_id = picks.team_id
            AND team_memberships.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.races
            WHERE races.id = picks.race_id
            AND races.deadline_datetime > NOW()
            AND races.status = 'upcoming'
        )
    );

CREATE POLICY "Team members can update picks before deadline" ON public.picks FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.team_memberships
            WHERE team_memberships.team_id = picks.team_id
            AND team_memberships.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM public.races
            WHERE races.id = picks.race_id
            AND races.deadline_datetime > NOW()
            AND races.status = 'upcoming'
        )
    );

CREATE POLICY "Commissioners can manage all picks" ON public.picks FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Driver Usages: Everyone can read
CREATE POLICY "Usages are viewable by everyone" ON public.driver_usages FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage usages" ON public.driver_usages FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Standings: Everyone can read
CREATE POLICY "Standings are viewable by everyone" ON public.standings FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage standings" ON public.standings FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Race Scores: Everyone can read
CREATE POLICY "Scores are viewable by everyone" ON public.race_scores FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage scores" ON public.race_scores FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- Announcements: Everyone can read, commissioners can post
CREATE POLICY "Announcements are viewable by everyone" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Commissioners can manage announcements" ON public.announcements FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_commissioner = true));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_races_updated_at BEFORE UPDATE ON public.races
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_picks_updated_at BEFORE UPDATE ON public.picks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- SEED DATA: 2025 NASCAR Cup Series Drivers
-- ============================================
INSERT INTO public.drivers (name, car_number, team_name, is_active) VALUES
('Ross Chastain', 1, 'Trackhouse Racing', true),
('Austin Cindric', 2, 'Team Penske', true),
('Austin Dillon', 3, 'Richard Childress Racing', true),
('Josh Berry', 4, 'Stewart-Haas Racing', true),
('Kyle Larson', 5, 'Hendrick Motorsports', true),
('Brad Keselowski', 6, 'RFK Racing', true),
('Corey LaJoie', 7, 'Spire Motorsports', true),
('Kyle Busch', 8, 'Richard Childress Racing', true),
('Chase Elliott', 9, 'Hendrick Motorsports', true),
('Noah Gragson', 10, 'Stewart-Haas Racing', true),
('Denny Hamlin', 11, 'Joe Gibbs Racing', true),
('Ryan Blaney', 12, 'Team Penske', true),
('Ty Gibbs', 14, 'Joe Gibbs Racing', true),
('Christopher Bell', 20, 'Joe Gibbs Racing', true),
('Harrison Burton', 21, 'Wood Brothers Racing', true),
('Joey Logano', 22, 'Team Penske', true),
('Bubba Wallace', 23, '23XI Racing', true),
('William Byron', 24, 'Hendrick Motorsports', true),
('Shane van Gisbergen', 16, 'Kaulig Racing', true),
('Martin Truex Jr.', 19, 'Joe Gibbs Racing', true),
('Erik Jones', 43, 'Legacy Motor Club', true),
('Tyler Reddick', 45, '23XI Racing', true),
('Ricky Stenhouse Jr.', 47, 'JTG Daugherty Racing', true),
('Alex Bowman', 48, 'Hendrick Motorsports', true),
('Daniel Suarez', 99, 'Trackhouse Racing', true),
('Carson Hocevar', 77, 'Spire Motorsports', true),
('Michael McDowell', 34, 'Front Row Motorsports', true),
('Todd Gilliland', 38, 'Front Row Motorsports', true),
('Ryan Preece', 41, 'Stewart-Haas Racing', true),
('John Hunter Nemechek', 42, 'Legacy Motor Club', true),
('Chris Buescher', 17, 'RFK Racing', true),
('Zane Smith', 71, 'Spire Motorsports', true),
('Chase Briscoe', 14, 'Stewart-Haas Racing', true);

-- Note: Some driver numbers may need updating for 2025 season changes
