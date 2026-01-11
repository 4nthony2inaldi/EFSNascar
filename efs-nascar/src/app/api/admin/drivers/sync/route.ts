import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Import the static JSON data to get all drivers
import results2020 from '@/data/results/nascar-results-2020.json';
import results2022 from '@/data/results/nascar-results-2022.json';
import results2023 from '@/data/results/nascar-results-2023.json';
import results2024 from '@/data/results/nascar-results-2024.json';
import results2025 from '@/data/results/nascar-results-2025.json';

interface RaceResult {
  driver: string;
  car: string;
  [key: string]: any;
}

interface RaceData {
  results: RaceResult[];
  season: number;
  [key: string]: any;
}

interface DriverInfo {
  name: string;
  car_number: string;
}

// Extract all unique drivers with their most recent car numbers
function getAllDriversWithCarNumbers(): DriverInfo[] {
  // Process in reverse chronological order so most recent car number wins
  const allResults = [
    ...(results2025 as RaceData[]),
    ...(results2024 as RaceData[]),
    ...(results2023 as RaceData[]),
    ...(results2022 as RaceData[]),
    ...(results2020 as RaceData[]),
  ];

  const driverMap = new Map<string, string>(); // driver name -> car number

  for (const race of allResults) {
    for (const result of race.results) {
      if (result.driver && !driverMap.has(result.driver)) {
        // Only set if not already set (since we're going newest to oldest)
        driverMap.set(result.driver, result.car || '0');
      }
    }
  }

  return Array.from(driverMap.entries())
    .map(([name, car_number]) => ({ name, car_number }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export async function POST() {
  try {
    const supabase = await createClient();

    // Get all existing drivers
    const { data: existingDrivers, error: fetchError } = await supabase
      .from('drivers')
      .select('id, name');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Create a set of normalized existing driver names
    const existingNormalized = new Set(
      (existingDrivers || []).map(d => normalizeDriverName(d.name))
    );

    // Get all drivers from historical data with car numbers
    const allDrivers = getAllDriversWithCarNumbers();

    // Find drivers that don't exist yet
    const missingDrivers = allDrivers.filter(
      d => !existingNormalized.has(normalizeDriverName(d.name))
    );

    if (missingDrivers.length === 0) {
      return NextResponse.json({
        message: 'All drivers already exist in database',
        added: 0,
        total: allDrivers.length,
        existing: existingDrivers?.length || 0,
      });
    }

    // Add missing drivers with car numbers
    const { data: insertedDrivers, error: insertError } = await supabase
      .from('drivers')
      .insert(missingDrivers.map(d => ({
        name: d.name,
        car_number: d.car_number
      })))
      .select('name');

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Added ${insertedDrivers?.length || 0} new drivers`,
      added: insertedDrivers?.length || 0,
      drivers: insertedDrivers?.map(d => d.name) || [],
      total: allDrivers.length,
      existing: existingDrivers?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Return the list of all drivers from historical data
  const allDrivers = getAllDriversWithCarNumbers();
  return NextResponse.json({
    totalDrivers: allDrivers.length,
    drivers: allDrivers,
    description: 'POST to sync all historical drivers to the database',
  });
}
