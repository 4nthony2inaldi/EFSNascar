-- Migration: Add api_driver_name and api_car_number columns to race_results
-- Purpose: Store original API data for re-matching when drivers change car numbers
--
-- This fixes the issue where drivers like Shane van Gisbergen who change car numbers
-- (e.g., #88 to #16) have their results misattributed because the original driver
-- name from the API was lost after the initial match to driver_id.

-- Add columns to store original API data
ALTER TABLE race_results
ADD COLUMN IF NOT EXISTS api_driver_name text,
ADD COLUMN IF NOT EXISTS api_car_number integer;

-- Add comment explaining the columns
COMMENT ON COLUMN race_results.api_driver_name IS 'Original driver name from NASCAR API at time of import';
COMMENT ON COLUMN race_results.api_car_number IS 'Original car number from NASCAR API at time of import';

-- Create index for efficient lookups by api_driver_name (for re-linking)
CREATE INDEX IF NOT EXISTS idx_race_results_api_driver_name
ON race_results(api_driver_name)
WHERE api_driver_name IS NOT NULL;
