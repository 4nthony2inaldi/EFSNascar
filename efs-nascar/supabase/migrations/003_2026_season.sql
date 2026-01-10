-- 2026 NASCAR Cup Series Season Setup
-- Run this after 002_seed_teams.sql

-- Deactivate 2025 season
UPDATE public.seasons SET is_active = false WHERE year = 2025;

-- Create 2026 season
INSERT INTO public.seasons (year, name, start_date, end_date, is_active) VALUES
(2026, '2026 Season', '2026-02-15', '2026-11-08', true);

-- Add default bonus usages for all teams (1 bonus 5th use each)
INSERT INTO public.team_season_bonuses (team_id, season_id, bonus_usages)
SELECT t.id, s.id, 1
FROM public.teams t
CROSS JOIN public.seasons s
WHERE s.year = 2026;

-- Initialize standings for all teams
INSERT INTO public.standings (team_id, season_id, race_id, total_points, race_wins, stage_wins, top_10_bonuses, rank)
SELECT t.id, s.id, NULL, 0, 0, 0, 0, t.car_number
FROM public.teams t
CROSS JOIN public.seasons s
WHERE s.year = 2026;

-- Full 2026 NASCAR Cup Series Schedule (36 races)
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    r.race_num,
    r.race_name,
    r.race_track,
    r.scheduled_dt::timestamptz,
    r.deadline_dt::timestamptz,
    r.race_type::race_type,
    'upcoming'::race_status
FROM public.seasons s,
(VALUES
    -- REGULAR SEASON (Races 1-26)
    (1, 'Daytona 500', 'Daytona International Speedway', '2026-02-15 14:30:00-05', '2026-02-15 12:00:00-05', 'regular'),
    (2, 'Ambetter Health 400', 'Atlanta Motor Speedway', '2026-02-22 15:00:00-05', '2026-02-22 12:00:00-05', 'regular'),
    (3, 'Pennzoil 400', 'Las Vegas Motor Speedway', '2026-03-01 15:30:00-08', '2026-03-01 12:00:00-08', 'regular'),
    (4, 'Shriners Children''s 500', 'Phoenix Raceway', '2026-03-08 15:30:00-07', '2026-03-08 12:00:00-07', 'regular'),
    (5, 'Food City 500', 'Bristol Motor Speedway', '2026-03-15 15:00:00-04', '2026-03-15 12:00:00-04', 'regular'),
    (6, 'EchoPark Automotive Grand Prix', 'Circuit of the Americas', '2026-03-22 15:30:00-05', '2026-03-22 12:00:00-05', 'regular'),
    (7, 'Toyota Owners 400', 'Richmond Raceway', '2026-03-29 15:00:00-04', '2026-03-29 12:00:00-04', 'regular'),
    (8, 'Cook Out 400', 'Martinsville Speedway', '2026-04-05 15:00:00-04', '2026-04-05 12:00:00-04', 'regular'),
    (9, 'AutoTrader EchoPark Automotive 400', 'Texas Motor Speedway', '2026-04-12 15:30:00-05', '2026-04-12 12:00:00-05', 'regular'),
    (10, 'GEICO 500', 'Talladega Superspeedway', '2026-04-19 15:00:00-05', '2026-04-19 12:00:00-05', 'regular'),
    (11, 'Würth 400', 'Dover Motor Speedway', '2026-04-26 15:00:00-04', '2026-04-26 12:00:00-04', 'regular'),
    (12, 'AdventHealth 400', 'Kansas Speedway', '2026-05-03 15:00:00-05', '2026-05-03 12:00:00-05', 'regular'),
    (13, 'Goodyear 400', 'Darlington Raceway', '2026-05-10 15:00:00-04', '2026-05-10 12:00:00-04', 'regular'),
    (14, 'All-Star Race', 'North Wilkesboro Speedway', '2026-05-17 20:00:00-04', '2026-05-17 17:00:00-04', 'exhibition'),
    (15, 'Coca-Cola 600', 'Charlotte Motor Speedway', '2026-05-24 18:00:00-04', '2026-05-24 15:00:00-04', 'regular'),
    (16, 'Enjoy Illinois 300', 'World Wide Technology Raceway', '2026-05-31 15:30:00-05', '2026-05-31 12:00:00-05', 'regular'),
    (17, 'Toyota/Save Mart 350', 'Sonoma Raceway', '2026-06-07 15:30:00-07', '2026-06-07 12:00:00-07', 'regular'),
    (18, 'Iowa Corn 350', 'Iowa Speedway', '2026-06-14 19:00:00-05', '2026-06-14 16:00:00-05', 'regular'),
    (19, 'USA Today 301', 'New Hampshire Motor Speedway', '2026-06-21 14:30:00-04', '2026-06-21 11:00:00-04', 'regular'),
    (20, 'Ally 400', 'Nashville Superspeedway', '2026-06-28 17:00:00-05', '2026-06-28 14:00:00-05', 'regular'),
    (21, 'Grant Park 165', 'Chicago Street Course', '2026-07-05 17:30:00-05', '2026-07-05 14:00:00-05', 'regular'),
    (22, 'Quaker State 400', 'Atlanta Motor Speedway', '2026-07-12 15:00:00-04', '2026-07-12 12:00:00-04', 'regular'),
    (23, 'Brickyard 400', 'Indianapolis Motor Speedway', '2026-07-19 14:30:00-04', '2026-07-19 11:00:00-04', 'regular'),
    (24, 'Cook Out 400', 'Richmond Raceway', '2026-07-26 18:00:00-04', '2026-07-26 15:00:00-04', 'regular'),
    (25, 'FireKeepers Casino 400', 'Michigan International Speedway', '2026-08-02 14:30:00-04', '2026-08-02 11:00:00-04', 'regular'),
    (26, 'Go Bowling at The Glen', 'Watkins Glen International', '2026-08-09 15:00:00-04', '2026-08-09 12:00:00-04', 'regular'),
    (27, 'Coke Zero Sugar 400', 'Daytona International Speedway', '2026-08-22 19:30:00-04', '2026-08-22 16:00:00-04', 'regular'),
    (28, 'Southern 500', 'Darlington Raceway', '2026-08-30 18:00:00-04', '2026-08-30 15:00:00-04', 'regular'),

    -- PLAYOFFS ROUND OF 16 (Races 29-31)
    (29, 'Quaker State 400', 'Atlanta Motor Speedway', '2026-09-06 15:00:00-04', '2026-09-06 12:00:00-04', 'playoff_round1'),
    (30, 'Bass Pro Shops Night Race', 'Bristol Motor Speedway', '2026-09-12 19:30:00-04', '2026-09-12 16:00:00-04', 'playoff_round1'),
    (31, 'Hollywood Casino 400', 'Kansas Speedway', '2026-09-20 15:00:00-05', '2026-09-20 12:00:00-05', 'playoff_round1'),

    -- PLAYOFFS ROUND OF 12 (Races 32-34)
    (32, 'YellaWood 500', 'Talladega Superspeedway', '2026-09-27 14:00:00-05', '2026-09-27 11:00:00-05', 'playoff_round2'),
    (33, 'Bank of America ROVAL 400', 'Charlotte Motor Speedway ROVAL', '2026-10-04 14:00:00-04', '2026-10-04 11:00:00-04', 'playoff_round2'),
    (34, 'South Point 400', 'Las Vegas Motor Speedway', '2026-10-11 14:30:00-07', '2026-10-11 11:00:00-07', 'playoff_round2'),

    -- PLAYOFFS ROUND OF 8 (Races 35-37)
    (35, 'Autotrader EchoPark Automotive 500', 'Texas Motor Speedway', '2026-10-18 14:00:00-05', '2026-10-18 11:00:00-05', 'playoff_round2'),
    (36, 'Straight Talk Wireless 400', 'Homestead-Miami Speedway', '2026-10-25 14:30:00-04', '2026-10-25 11:00:00-04', 'playoff_round2'),
    (37, 'Xfinity 500', 'Martinsville Speedway', '2026-11-01 14:00:00-05', '2026-11-01 11:00:00-05', 'playoff_round2'),

    -- CHAMPIONSHIP RACE (Race 38)
    (38, 'NASCAR Cup Series Championship', 'Phoenix Raceway', '2026-11-08 15:00:00-07', '2026-11-08 12:00:00-07', 'playoff_finals')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt, race_type)
WHERE s.year = 2026;
