-- Seed the 17 fantasy teams for the EFS NASCAR League
-- Run this after 001_initial_schema.sql

INSERT INTO public.teams (name, car_number) VALUES
('Sofa King Racing', 1),
('ACRacing', 2),
('Brace for Impact', 3),
('Pure Pleasure''s Pole', 4),
('Rock Motorsports', 5),
('BMW USA Racing', 6),
('Shake-n-Bake', 7),
('"The Big One" Brian', 8),
('Beamy''s Burnouts', 9),
('x0x_ChestHair Elliott_x0x', 10),
('High Line Racing', 11),
('Lowrie''s Left Turns', 12),
('Clean Air Motorsports', 13),
('Cruise Control', 14),
('ArMUCKi Motorsports', 15),
('Mill$Big High Life Racing', 16),
('Stinned Super Speedway', 17);

-- Create 2025 season
INSERT INTO public.seasons (year, name, start_date, end_date, is_active) VALUES
(2025, '2025 Season', '2025-02-16', '2025-11-02', true);

-- Add default bonus usages for all teams (1 bonus 5th use each)
INSERT INTO public.team_season_bonuses (team_id, season_id, bonus_usages)
SELECT t.id, s.id, 1
FROM public.teams t
CROSS JOIN public.seasons s
WHERE s.year = 2025;

-- Initialize standings for all teams
INSERT INTO public.standings (team_id, season_id, race_id, total_points, race_wins, stage_wins, top_10_bonuses, rank)
SELECT t.id, s.id, NULL, 0, 0, 0, 0, t.car_number
FROM public.teams t
CROSS JOIN public.seasons s
WHERE s.year = 2025;

-- Sample 2025 NASCAR Cup Series Schedule (first few races)
-- Adjust dates/times as needed for the actual 2025 schedule
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    race_number,
    name,
    track,
    scheduled_datetime,
    deadline_datetime,
    'regular'::race_type,
    'upcoming'::race_status
FROM public.seasons s,
(VALUES
    (1, 'Daytona 500', 'Daytona International Speedway', '2025-02-16 14:30:00-05', '2025-02-16 12:00:00-05'),
    (2, 'Ambetter Health 400', 'Atlanta Motor Speedway', '2025-02-23 15:00:00-05', '2025-02-23 12:00:00-05'),
    (3, 'Pennzoil 400', 'Las Vegas Motor Speedway', '2025-03-02 15:30:00-08', '2025-03-02 12:00:00-08'),
    (4, 'Shriners Children''s 500', 'Phoenix Raceway', '2025-03-09 15:30:00-07', '2025-03-09 12:00:00-07'),
    (5, 'Food City 500', 'Bristol Motor Speedway', '2025-03-16 15:00:00-04', '2025-03-16 12:00:00-04'),
    (6, 'EchoPark Automotive Grand Prix', 'Circuit of the Americas', '2025-03-23 15:30:00-05', '2025-03-23 12:00:00-05'),
    (7, 'Toyota Owners 400', 'Richmond Raceway', '2025-03-30 15:00:00-04', '2025-03-30 12:00:00-04'),
    (8, 'Cook Out 400', 'Martinsville Speedway', '2025-04-06 15:00:00-04', '2025-04-06 12:00:00-04'),
    (9, 'AutoTrader EchoPark Automotive 400', 'Texas Motor Speedway', '2025-04-13 15:30:00-05', '2025-04-13 12:00:00-05'),
    (10, 'GEICO 500', 'Talladega Superspeedway', '2025-04-20 15:00:00-05', '2025-04-20 12:00:00-05')
) AS races(race_number, name, track, scheduled_datetime, deadline_datetime)
WHERE s.year = 2025;
