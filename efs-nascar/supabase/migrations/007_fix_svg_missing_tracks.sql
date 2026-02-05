-- Fix Missing Tracks and Race Schedule for SVG Fantasy Points
-- This migration adds missing tracks that exist in the NASCAR 2025 schedule
-- but were not included in the initial database setup.

-- ============================================
-- ADD MISSING TRACKS
-- ============================================
-- These tracks are in the 2025 NASCAR Cup Series schedule but missing from the database
INSERT INTO public.tracks (name, short_name, location, track_type, length_miles, banking_degrees, logo_url) VALUES
('Autódromo Hermanos Rodríguez', 'Mexico City', 'Mexico City, Mexico', 'road_course', 2.674, 0, '/tracks/mexico.png'),
('Charlotte Motor Speedway Road Course', 'Charlotte RC', 'Concord, NC', 'road_course', 2.28, 0, '/tracks/charlotte-roval.png'),
('Homestead-Miami Speedway', 'Homestead', 'Homestead, FL', 'intermediate', 1.5, 20, '/tracks/homestead.png'),
('Pocono Raceway', 'Pocono', 'Long Pond, PA', 'superspeedway', 2.5, 14, '/tracks/pocono.png'),
('EchoPark Speedway', 'EchoPark', 'Austin, TX', 'short_track', 0.75, 12, '/tracks/echopark.png')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- ADD MISSING 2025 RACES
-- ============================================
-- The actual 2025 NASCAR schedule has more races than initially seeded.
-- Add races 28-36 which include key road course races where SVG excels.

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
    -- Additional 2025 races (28-36) - these are from NASCAR's official schedule
    (28, 'Hollywood Casino 400', 'Kansas Speedway', '2025-09-07 15:00:00-05', '2025-09-07 12:00:00-05'),
    (29, 'Bass Pro Shops Night Race', 'Bristol Motor Speedway', '2025-09-13 19:30:00-04', '2025-09-13 16:00:00-04'),
    (30, 'South Point 400', 'Las Vegas Motor Speedway', '2025-09-21 19:00:00-07', '2025-09-21 16:00:00-07'),
    (31, 'YellaWood 500', 'Talladega Superspeedway', '2025-09-28 15:00:00-05', '2025-09-28 12:00:00-05'),
    (32, 'Bank of America ROVAL 400', 'Charlotte Motor Speedway Road Course', '2025-10-05 14:00:00-04', '2025-10-05 11:00:00-04'),
    (33, 'Straight Talk Wireless 400', 'Homestead-Miami Speedway', '2025-10-26 14:30:00-04', '2025-10-26 11:00:00-04'),
    (34, 'Xfinity 500', 'Martinsville Speedway', '2025-11-02 14:00:00-05', '2025-11-02 11:00:00-05'),
    (35, 'NASCAR Cup Series Championship', 'Phoenix Raceway', '2025-11-09 15:00:00-07', '2025-11-09 12:00:00-07'),
    (36, 'Grant Park 220', 'Chicago Street Course', '2025-07-06 17:30:00-05', '2025-07-06 14:00:00-05')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt)
WHERE s.year = 2025
AND NOT EXISTS (SELECT 1 FROM public.races WHERE season_id = s.id AND race_number = r.race_num);

-- ============================================
-- ADD MEXICO CITY RACE TO 2025 SCHEDULE
-- ============================================
-- SVG won this race - it's critical for his fantasy points
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    16,
    'NASCAR Mexico City GP',
    'Autódromo Hermanos Rodríguez',
    '2025-06-15 15:00:00-05'::timestamptz,
    '2025-06-15 12:00:00-05'::timestamptz,
    'regular'::race_type,
    'final'::race_status
FROM public.seasons s
WHERE s.year = 2025
AND NOT EXISTS (
    SELECT 1 FROM public.races r2
    WHERE r2.season_id = s.id
    AND r2.track = 'Autódromo Hermanos Rodríguez'
);

-- Also add Homestead race which is in the JSON data
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    6,
    '4EVER 400 Presented by Mobil 1',
    'Homestead-Miami Speedway',
    '2025-02-23 14:30:00-05'::timestamptz,
    '2025-02-23 11:00:00-05'::timestamptz,
    'regular'::race_type,
    'final'::race_status
FROM public.seasons s
WHERE s.year = 2025
AND NOT EXISTS (
    SELECT 1 FROM public.races r2
    WHERE r2.season_id = s.id
    AND r2.track = 'Homestead-Miami Speedway'
);

-- Add Pocono race
INSERT INTO public.races (season_id, race_number, name, track, scheduled_datetime, deadline_datetime, race_type, status)
SELECT
    s.id,
    17,
    'HighPoint.com 400',
    'Pocono Raceway',
    '2025-07-13 14:30:00-04'::timestamptz,
    '2025-07-13 11:00:00-04'::timestamptz,
    'regular'::race_type,
    'final'::race_status
FROM public.seasons s
WHERE s.year = 2025
AND NOT EXISTS (
    SELECT 1 FROM public.races r2
    WHERE r2.season_id = s.id
    AND r2.track = 'Pocono Raceway'
);

-- ============================================
-- ADD MISSING 2024 RACES (28-36)
-- ============================================
-- SVG had key results in these races:
-- Race 28 (Watkins Glen): P2 = 9 pts
-- Race 32 (Charlotte Roval): P7 = 4 pts

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
    (28, 'Go Bowling at The Glen', 'Watkins Glen International', '2024-09-15 15:00:00-04', '2024-09-15 12:00:00-04'),
    (29, 'Cook Out Southern 500', 'Darlington Raceway', '2024-09-01 18:00:00-04', '2024-09-01 15:00:00-04'),
    (30, 'Quaker State 400', 'Atlanta Motor Speedway', '2024-09-08 15:00:00-04', '2024-09-08 12:00:00-04'),
    (31, 'YellaWood 500', 'Talladega Superspeedway', '2024-09-29 15:00:00-05', '2024-09-29 12:00:00-05'),
    (32, 'Bank of America ROVAL 400', 'Charlotte Motor Speedway Road Course', '2024-10-13 14:00:00-04', '2024-10-13 11:00:00-04'),
    (33, 'South Point 400', 'Las Vegas Motor Speedway', '2024-10-20 14:30:00-07', '2024-10-20 11:00:00-07'),
    (34, 'Straight Talk Wireless 400', 'Homestead-Miami Speedway', '2024-10-27 14:30:00-04', '2024-10-27 11:00:00-04'),
    (35, 'Xfinity 500', 'Martinsville Speedway', '2024-11-03 14:00:00-05', '2024-11-03 11:00:00-05'),
    (36, 'NASCAR Cup Series Championship', 'Phoenix Raceway', '2024-11-10 15:00:00-07', '2024-11-10 12:00:00-07')
) AS r(race_num, race_name, race_track, scheduled_dt, deadline_dt)
WHERE s.year = 2024
AND NOT EXISTS (SELECT 1 FROM public.races WHERE season_id = s.id AND race_number = r.race_num);

-- ============================================
-- UPDATE SVG'S DRIVER RECORD
-- ============================================
-- Shane van Gisbergen moved from #16 Kaulig Racing (2024) to #88 Trackhouse Racing (2025)
-- Update his driver record to reflect 2025 info
UPDATE public.drivers
SET car_number = 88, team_name = 'Trackhouse Racing'
WHERE name = 'Shane van Gisbergen';

-- ============================================
-- UPDATE TRACK REFERENCES
-- ============================================
-- Link races to tracks table where possible
UPDATE public.races r
SET track_id = t.id
FROM public.tracks t
WHERE r.track_id IS NULL
AND (
    r.track = t.name
    OR LOWER(r.track) LIKE '%' || LOWER(t.short_name) || '%'
);
