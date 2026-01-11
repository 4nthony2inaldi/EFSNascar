-- Complete Race Schedules for Fantasy Points Calculation
-- This migration adds missing races for 2025 and creates historical seasons (2023, 2024)
-- to allow proper fantasy points calculation including all tracks where drivers competed

-- ============================================
-- ADD MISSING TRACKS
-- ============================================
-- Indianapolis Motor Speedway Road Course is distinct from the oval
INSERT INTO public.tracks (name, short_name, location, track_type, length_miles, banking_degrees, logo_url) VALUES
('Indianapolis Motor Speedway Road Course', 'Indy RC', 'Indianapolis, IN', 'road_course', 2.439, 0, '/tracks/indy-rc.png'),
('Auto Club Speedway', 'Auto Club', 'Fontana, CA', 'intermediate', 2.000, 14, '/tracks/autoclub.png')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- COMPLETE 2025 SEASON SCHEDULE
-- ============================================
-- The initial seed only had races 1-10. Add races 11-27 to complete the schedule.

-- First, get the 2025 season ID and add remaining races
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    r.race_num,
    r.race_name,
    r.race_track,
    r.scheduled_dt::timestamptz,
    r.deadline_dt::timestamptz,
    'regular'::race_type,
    'upcoming'::race_status
FROM public.seasons s,
(VALUES
    -- Remaining 2025 races (11-27)
    (11, 'Wurth 400', 'Dover Motor Speedway', '2025-04-27 15:00:00-04', '2025-04-27 12:00:00-04'),
    (12, 'AdventHealth 400', 'Kansas Speedway', '2025-05-04 15:00:00-05', '2025-05-04 12:00:00-05'),
    (13, 'Goodyear 400', 'Darlington Raceway', '2025-05-11 15:00:00-04', '2025-05-11 12:00:00-04'),
    (14, 'All-Star Race', 'North Wilkesboro Speedway', '2025-05-18 20:00:00-04', '2025-05-18 17:00:00-04'),
    (15, 'Coca-Cola 600', 'Charlotte Motor Speedway', '2025-05-25 18:00:00-04', '2025-05-25 15:00:00-04'),
    (16, 'Enjoy Illinois 300', 'World Wide Technology Raceway', '2025-06-01 15:30:00-05', '2025-06-01 12:00:00-05'),
    (17, 'Toyota/Save Mart 350', 'Sonoma Raceway', '2025-06-08 15:30:00-07', '2025-06-08 12:00:00-07'),
    (18, 'Iowa Corn 350', 'Iowa Speedway', '2025-06-15 19:00:00-05', '2025-06-15 16:00:00-05'),
    (19, 'USA Today 301', 'New Hampshire Motor Speedway', '2025-06-22 14:30:00-04', '2025-06-22 11:00:00-04'),
    (20, 'Ally 400', 'Nashville Superspeedway', '2025-06-29 17:00:00-05', '2025-06-29 14:00:00-05'),
    (21, 'Grant Park 165', 'Chicago Street Course', '2025-07-06 17:30:00-05', '2025-07-06 14:00:00-05'),
    (22, 'Brickyard 400', 'Indianapolis Motor Speedway', '2025-07-20 14:30:00-04', '2025-07-20 11:00:00-04'),
    (23, 'Quaker State 400', 'Atlanta Motor Speedway', '2025-07-27 15:00:00-04', '2025-07-27 12:00:00-04'),
    (24, 'FireKeepers Casino 400', 'Michigan International Speedway', '2025-08-10 14:30:00-04', '2025-08-10 11:00:00-04'),
    (25, 'Go Bowling at The Glen', 'Watkins Glen International', '2025-08-17 15:00:00-04', '2025-08-17 12:00:00-04'),
    (26, 'Coke Zero Sugar 400', 'Daytona International Speedway', '2025-08-24 19:30:00-04', '2025-08-24 16:00:00-04'),
    (27, 'Cook Out Southern 500', 'Darlington Raceway', '2025-08-31 18:00:00-04', '2025-08-31 15:00:00-04')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt)
WHERE s.year = 2025
AND NOT EXISTS (SELECT 1 FROM public.races WHERE season_id = s.id AND race_number = r.race_num);

-- ============================================
-- 2024 HISTORICAL SEASON
-- ============================================
INSERT INTO public.seasons (year, name, start_date, end_date, is_active) VALUES
(2024, '2024 Season', '2024-02-18', '2024-11-10', false)
ON CONFLICT DO NOTHING;

-- 2024 race schedule (simplified - key races for fantasy tracking)
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    r.race_num,
    r.race_name,
    r.race_track,
    r.scheduled_dt::timestamptz,
    r.deadline_dt::timestamptz,
    'regular'::race_type,
    'final'::race_status
FROM public.seasons s,
(VALUES
    (1, 'Daytona 500', 'Daytona International Speedway', '2024-02-18 14:30:00-05', '2024-02-18 12:00:00-05'),
    (2, 'Ambetter Health 400', 'Atlanta Motor Speedway', '2024-02-25 15:00:00-05', '2024-02-25 12:00:00-05'),
    (3, 'Pennzoil 400', 'Las Vegas Motor Speedway', '2024-03-03 15:30:00-08', '2024-03-03 12:00:00-08'),
    (4, 'Shriners Children''s 500', 'Phoenix Raceway', '2024-03-10 15:30:00-07', '2024-03-10 12:00:00-07'),
    (5, 'Food City 500', 'Bristol Motor Speedway', '2024-03-17 15:00:00-04', '2024-03-17 12:00:00-04'),
    (6, 'EchoPark Automotive Grand Prix', 'Circuit of the Americas', '2024-03-24 15:30:00-05', '2024-03-24 12:00:00-05'),
    (7, 'Toyota Owners 400', 'Richmond Raceway', '2024-03-31 15:00:00-04', '2024-03-31 12:00:00-04'),
    (8, 'Cook Out 400', 'Martinsville Speedway', '2024-04-07 15:00:00-04', '2024-04-07 12:00:00-04'),
    (9, 'AutoTrader EchoPark Automotive 400', 'Texas Motor Speedway', '2024-04-14 15:30:00-05', '2024-04-14 12:00:00-05'),
    (10, 'GEICO 500', 'Talladega Superspeedway', '2024-04-21 15:00:00-05', '2024-04-21 12:00:00-05'),
    (11, 'Wurth 400', 'Dover Motor Speedway', '2024-04-28 15:00:00-04', '2024-04-28 12:00:00-04'),
    (12, 'AdventHealth 400', 'Kansas Speedway', '2024-05-05 15:00:00-05', '2024-05-05 12:00:00-05'),
    (13, 'Goodyear 400', 'Darlington Raceway', '2024-05-12 15:00:00-04', '2024-05-12 12:00:00-04'),
    (14, 'All-Star Race', 'North Wilkesboro Speedway', '2024-05-19 20:00:00-04', '2024-05-19 17:00:00-04'),
    (15, 'Coca-Cola 600', 'Charlotte Motor Speedway', '2024-05-26 18:00:00-04', '2024-05-26 15:00:00-04'),
    (16, 'Enjoy Illinois 300', 'World Wide Technology Raceway', '2024-06-02 15:30:00-05', '2024-06-02 12:00:00-05'),
    (17, 'Toyota/Save Mart 350', 'Sonoma Raceway', '2024-06-09 15:30:00-07', '2024-06-09 12:00:00-07'),
    (18, 'Iowa Corn 350', 'Iowa Speedway', '2024-06-16 19:00:00-05', '2024-06-16 16:00:00-05'),
    (19, 'USA Today 301', 'New Hampshire Motor Speedway', '2024-06-23 14:30:00-04', '2024-06-23 11:00:00-04'),
    (20, 'Ally 400', 'Nashville Superspeedway', '2024-06-30 17:00:00-05', '2024-06-30 14:00:00-05'),
    (21, 'Grant Park 165', 'Chicago Street Course', '2024-07-07 17:30:00-05', '2024-07-07 14:00:00-05'),
    (22, 'Brickyard 400', 'Indianapolis Motor Speedway', '2024-07-21 14:30:00-04', '2024-07-21 11:00:00-04'),
    (23, 'Quaker State 400', 'Atlanta Motor Speedway', '2024-07-28 15:00:00-04', '2024-07-28 12:00:00-04'),
    (24, 'FireKeepers Casino 400', 'Michigan International Speedway', '2024-08-11 14:30:00-04', '2024-08-11 11:00:00-04'),
    (25, 'Go Bowling at The Glen', 'Watkins Glen International', '2024-08-18 15:00:00-04', '2024-08-18 12:00:00-04'),
    (26, 'Coke Zero Sugar 400', 'Daytona International Speedway', '2024-08-25 19:30:00-04', '2024-08-25 16:00:00-04'),
    (27, 'Cook Out Southern 500', 'Darlington Raceway', '2024-09-01 18:00:00-04', '2024-09-01 15:00:00-04')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt)
WHERE s.year = 2024;

-- ============================================
-- 2023 HISTORICAL SEASON
-- ============================================
INSERT INTO public.seasons (year, name, start_date, end_date, is_active) VALUES
(2023, '2023 Season', '2023-02-19', '2023-11-05', false)
ON CONFLICT DO NOTHING;

-- 2023 race schedule (simplified - key races for fantasy tracking)
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    r.race_num,
    r.race_name,
    r.race_track,
    r.scheduled_dt::timestamptz,
    r.deadline_dt::timestamptz,
    'regular'::race_type,
    'final'::race_status
FROM public.seasons s,
(VALUES
    (1, 'Daytona 500', 'Daytona International Speedway', '2023-02-19 14:30:00-05', '2023-02-19 12:00:00-05'),
    (2, 'Pala Casino 400', 'Auto Club Speedway', '2023-02-26 15:30:00-08', '2023-02-26 12:00:00-08'),
    (3, 'Pennzoil 400', 'Las Vegas Motor Speedway', '2023-03-05 15:30:00-08', '2023-03-05 12:00:00-08'),
    (4, 'United Rentals Work United 500', 'Phoenix Raceway', '2023-03-12 15:30:00-07', '2023-03-12 12:00:00-07'),
    (5, 'Ambetter Health 400', 'Atlanta Motor Speedway', '2023-03-19 15:00:00-04', '2023-03-19 12:00:00-04'),
    (6, 'EchoPark Automotive Grand Prix', 'Circuit of the Americas', '2023-03-26 15:30:00-05', '2023-03-26 12:00:00-05'),
    (7, 'Toyota Owners 400', 'Richmond Raceway', '2023-04-02 15:00:00-04', '2023-04-02 12:00:00-04'),
    (8, 'Food City Dirt Race', 'Bristol Motor Speedway', '2023-04-09 19:00:00-04', '2023-04-09 16:00:00-04'),
    (9, 'Cook Out 400', 'Martinsville Speedway', '2023-04-16 15:00:00-04', '2023-04-16 12:00:00-04'),
    (10, 'GEICO 500', 'Talladega Superspeedway', '2023-04-23 15:00:00-05', '2023-04-23 12:00:00-05'),
    (11, 'Wurth 400', 'Dover Motor Speedway', '2023-04-30 15:00:00-04', '2023-04-30 12:00:00-04'),
    (12, 'AdventHealth 400', 'Kansas Speedway', '2023-05-07 15:00:00-05', '2023-05-07 12:00:00-05'),
    (13, 'Goodyear 400', 'Darlington Raceway', '2023-05-14 15:00:00-04', '2023-05-14 12:00:00-04'),
    (14, 'All-Star Race', 'North Wilkesboro Speedway', '2023-05-21 20:00:00-04', '2023-05-21 17:00:00-04'),
    (15, 'Coca-Cola 600', 'Charlotte Motor Speedway', '2023-05-28 18:00:00-04', '2023-05-28 15:00:00-04'),
    (16, 'Enjoy Illinois 300', 'World Wide Technology Raceway', '2023-06-04 15:30:00-05', '2023-06-04 12:00:00-05'),
    (17, 'Toyota/Save Mart 350', 'Sonoma Raceway', '2023-06-11 15:30:00-07', '2023-06-11 12:00:00-07'),
    (18, 'Grant Park 165', 'Chicago Street Course', '2023-07-02 17:30:00-05', '2023-07-02 14:00:00-05'),
    (19, 'Quaker State 400', 'Atlanta Motor Speedway', '2023-07-09 15:00:00-04', '2023-07-09 12:00:00-04'),
    (20, 'USA Today 301', 'New Hampshire Motor Speedway', '2023-07-16 14:30:00-04', '2023-07-16 11:00:00-04'),
    (21, 'Brickyard 400', 'Indianapolis Motor Speedway', '2023-07-23 14:30:00-04', '2023-07-23 11:00:00-04'),
    (22, 'Cook Out 400', 'Richmond Raceway', '2023-07-30 18:00:00-04', '2023-07-30 15:00:00-04'),
    (23, 'FireKeepers Casino 400', 'Michigan International Speedway', '2023-08-06 14:30:00-04', '2023-08-06 11:00:00-04'),
    (24, 'Verizon 200 at the Brickyard', 'Indianapolis Motor Speedway Road Course', '2023-08-13 14:30:00-04', '2023-08-13 11:00:00-04'),
    (25, 'Go Bowling at The Glen', 'Watkins Glen International', '2023-08-20 15:00:00-04', '2023-08-20 12:00:00-04'),
    (26, 'Coke Zero Sugar 400', 'Daytona International Speedway', '2023-08-27 19:30:00-04', '2023-08-27 16:00:00-04'),
    (27, 'Cook Out Southern 500', 'Darlington Raceway', '2023-09-03 18:00:00-04', '2023-09-03 15:00:00-04')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt)
WHERE s.year = 2023;

-- Update track_id references for new races
UPDATE public.races r
SET track_id = t.id
FROM public.tracks t
WHERE r.track_id IS NULL
AND (
    r.track = t.name
    OR LOWER(r.track) LIKE '%' || LOWER(t.short_name) || '%'
);
