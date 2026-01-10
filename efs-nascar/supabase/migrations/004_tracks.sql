-- Create track type enum
CREATE TYPE public.track_type AS ENUM (
  'superspeedway',
  'intermediate',
  'short_track',
  'road_course',
  'street_course',
  'dirt'
);

-- Create tracks table
CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  short_name TEXT,
  location TEXT,
  track_type public.track_type NOT NULL,
  length_miles DECIMAL(4,3),
  banking_degrees INTEGER,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS on tracks
ALTER TABLE public.tracks DISABLE ROW LEVEL SECURITY;

-- Insert NASCAR Cup Series tracks
INSERT INTO public.tracks (name, short_name, location, track_type, length_miles, banking_degrees, logo_url) VALUES
-- Superspeedways
('Daytona International Speedway', 'Daytona', 'Daytona Beach, FL', 'superspeedway', 2.500, 31, '/tracks/daytona.png'),
('Talladega Superspeedway', 'Talladega', 'Lincoln, AL', 'superspeedway', 2.660, 33, '/tracks/talladega.png'),

-- Intermediate Tracks
('Atlanta Motor Speedway', 'Atlanta', 'Hampton, GA', 'intermediate', 1.540, 28, '/tracks/atlanta.png'),
('Charlotte Motor Speedway', 'Charlotte', 'Concord, NC', 'intermediate', 1.500, 24, '/tracks/charlotte.png'),
('Kansas Speedway', 'Kansas', 'Kansas City, KS', 'intermediate', 1.500, 15, '/tracks/kansas.png'),
('Las Vegas Motor Speedway', 'Las Vegas', 'Las Vegas, NV', 'intermediate', 1.500, 20, '/tracks/lasvegas.png'),
('Michigan International Speedway', 'Michigan', 'Brooklyn, MI', 'intermediate', 2.000, 18, '/tracks/michigan.png'),
('Texas Motor Speedway', 'Texas', 'Fort Worth, TX', 'intermediate', 1.500, 24, '/tracks/texas.png'),
('Homestead-Miami Speedway', 'Homestead', 'Homestead, FL', 'intermediate', 1.500, 20, '/tracks/homestead.png'),
('Darlington Raceway', 'Darlington', 'Darlington, SC', 'intermediate', 1.366, 25, '/tracks/darlington.png'),
('Nashville Superspeedway', 'Nashville', 'Lebanon, TN', 'intermediate', 1.333, 14, '/tracks/nashville.png'),
('World Wide Technology Raceway', 'Gateway', 'Madison, IL', 'intermediate', 1.250, 11, '/tracks/gateway.png'),
('Phoenix Raceway', 'Phoenix', 'Avondale, AZ', 'intermediate', 1.000, 11, '/tracks/phoenix.png'),
('New Hampshire Motor Speedway', 'Loudon', 'Loudon, NH', 'intermediate', 1.058, 12, '/tracks/newhampshire.png'),
('Dover Motor Speedway', 'Dover', 'Dover, DE', 'intermediate', 1.000, 24, '/tracks/dover.png'),
('Iowa Speedway', 'Iowa', 'Newton, IA', 'intermediate', 0.875, 14, '/tracks/iowa.png'),
('Indianapolis Motor Speedway', 'Indy', 'Indianapolis, IN', 'intermediate', 2.500, 9, '/tracks/indianapolis.png'),

-- Short Tracks
('Bristol Motor Speedway', 'Bristol', 'Bristol, TN', 'short_track', 0.533, 28, '/tracks/bristol.png'),
('Martinsville Speedway', 'Martinsville', 'Martinsville, VA', 'short_track', 0.526, 12, '/tracks/martinsville.png'),
('Richmond Raceway', 'Richmond', 'Richmond, VA', 'short_track', 0.750, 14, '/tracks/richmond.png'),
('North Wilkesboro Speedway', 'N. Wilkesboro', 'North Wilkesboro, NC', 'short_track', 0.625, 14, '/tracks/northwilkesboro.png'),

-- Road Courses
('Sonoma Raceway', 'Sonoma', 'Sonoma, CA', 'road_course', 2.520, 0, '/tracks/sonoma.png'),
('Watkins Glen International', 'Watkins Glen', 'Watkins Glen, NY', 'road_course', 2.450, 0, '/tracks/watkinsglen.png'),
('Circuit of the Americas', 'COTA', 'Austin, TX', 'road_course', 3.426, 0, '/tracks/cota.png'),
('Road America', 'Road America', 'Elkhart Lake, WI', 'road_course', 4.048, 0, '/tracks/roadamerica.png'),

-- Street Course
('Chicago Street Course', 'Chicago', 'Chicago, IL', 'street_course', 2.200, 0, '/tracks/chicago.png');

-- Add track_id column to races table
ALTER TABLE public.races ADD COLUMN track_id UUID REFERENCES public.tracks(id);

-- Update existing races with track references
UPDATE public.races r
SET track_id = t.id
FROM public.tracks t
WHERE r.track = t.name;

-- Create index for faster lookups
CREATE INDEX idx_races_track_id ON public.races(track_id);
