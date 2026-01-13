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
  team_name: string;
}

// Extract all unique drivers with their most recent car numbers and teams
function getAllDriversWithInfo(): DriverInfo[] {
  // Process in reverse chronological order so most recent info wins
  const allResults = [
    ...(results2025 as RaceData[]),
    ...(results2024 as RaceData[]),
    ...(results2023 as RaceData[]),
    ...(results2022 as RaceData[]),
    ...(results2020 as RaceData[]),
  ];

  const driverMap = new Map<string, { car_number: string; team_name: string }>();

  for (const race of allResults) {
    for (const result of race.results) {
      if (result.driver && !driverMap.has(result.driver)) {
        // Only set if not already set (since we're going newest to oldest)
        driverMap.set(result.driver, {
          car_number: result.car || '0',
          team_name: result.team || '',
        });
      }
    }
  }

  return Array.from(driverMap.entries())
    .map(([name, info]) => ({ name, car_number: info.car_number, team_name: info.team_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeDriverName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export async function POST() {
  try {
    const supabase = await createClient();

    // Get all existing drivers with their current info
    const { data: existingDrivers, error: fetchError } = await supabase
      .from('drivers')
      .select('id, name, car_number, team_name');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Create a map of normalized name -> existing driver
    const existingMap = new Map(
      (existingDrivers || []).map(d => [normalizeDriverName(d.name), d])
    );

    // Get all drivers from historical data with car numbers and teams
    const allDrivers = getAllDriversWithInfo();

    // Separate into new drivers and drivers that need updates
    const missingDrivers: DriverInfo[] = [];
    const driversToUpdate: { id: string; car_number: number; team_name: string; name: string }[] = [];

    for (const driver of allDrivers) {
      const normalized = normalizeDriverName(driver.name);
      const existing = existingMap.get(normalized);

      if (!existing) {
        // New driver
        missingDrivers.push(driver);
      } else {
        // Check if car number or team changed
        const newCarNumber = parseInt(driver.car_number) || 0;
        if (existing.car_number !== newCarNumber || existing.team_name !== driver.team_name) {
          driversToUpdate.push({
            id: existing.id,
            car_number: newCarNumber,
            team_name: driver.team_name,
            name: driver.name,
          });
        }
      }
    }

    let added = 0;
    let updated = 0;
    const addedNames: string[] = [];
    const updatedNames: string[] = [];

    // Add missing drivers
    if (missingDrivers.length > 0) {
      const { data: insertedDrivers, error: insertError } = await supabase
        .from('drivers')
        .insert(missingDrivers.map(d => ({
          name: d.name,
          car_number: parseInt(d.car_number) || 0,
          team_name: d.team_name,
        })))
        .select('name');

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      added = insertedDrivers?.length || 0;
      addedNames.push(...(insertedDrivers?.map(d => d.name) || []));
    }

    // Update existing drivers with new car numbers/teams
    for (const driver of driversToUpdate) {
      const { error: updateError } = await supabase
        .from('drivers')
        .update({
          car_number: driver.car_number,
          team_name: driver.team_name,
        })
        .eq('id', driver.id);

      if (!updateError) {
        updated++;
        updatedNames.push(`${driver.name} → #${driver.car_number} ${driver.team_name}`);
      }
    }

    // Sample for debugging
    const sampleJsonDrivers = allDrivers.slice(0, 5).map(d => ({
      name: d.name,
      normalized: normalizeDriverName(d.name)
    }));
    const sampleDbDrivers = (existingDrivers || []).slice(0, 5).map(d => ({
      name: d.name,
      normalized: normalizeDriverName(d.name)
    }));

    return NextResponse.json({
      message: `Added ${added} new drivers, updated ${updated} existing drivers`,
      added,
      updated,
      addedDrivers: addedNames,
      updatedDrivers: updatedNames.slice(0, 20), // Show first 20 updates
      totalInJson: allDrivers.length,
      totalInDatabase: existingDrivers?.length || 0,
      sampleJsonDrivers,
      sampleDbDrivers,
      missingCount: missingDrivers.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Return the list of all drivers from historical data
  const allDrivers = getAllDriversWithInfo();
  return NextResponse.json({
    totalDrivers: allDrivers.length,
    drivers: allDrivers,
    description: 'POST to sync all historical drivers to the database (adds new drivers and updates existing ones with latest car numbers/teams)',
  });
}
