import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Historical drivers from past seasons
const HISTORICAL_DRIVERS = [
  { name: 'Justin Haley', car_number: 31, team_name: 'Kaulig Racing', is_active: false },
  { name: 'Kurt Busch', car_number: 45, team_name: '23XI Racing', is_active: false },
  { name: 'Kaz Grala', car_number: 50, team_name: 'Various', is_active: false },
  { name: 'Cole Custer', car_number: 41, team_name: 'Stewart-Haas Racing', is_active: false },
  { name: 'Daniel Hemric', car_number: 16, team_name: 'Kaulig Racing', is_active: false },
  { name: 'Aric Almirola', car_number: 10, team_name: 'Stewart-Haas Racing', is_active: false },
  { name: 'Kevin Harvick', car_number: 4, team_name: 'Stewart-Haas Racing', is_active: false },
  { name: 'AJ Allmendinger', car_number: 16, team_name: 'Kaulig Racing', is_active: false },
  { name: 'Ty Dillon', car_number: 42, team_name: 'Petty GMS', is_active: false },
  { name: 'Quin Houff', car_number: 0, team_name: 'StarCom Racing', is_active: false },
  // Additional historical drivers that might be needed
  { name: 'Matt DiBenedetto', car_number: 21, team_name: 'Wood Brothers Racing', is_active: false },
  { name: 'Erik Jones', car_number: 43, team_name: 'Petty GMS', is_active: true },
  { name: 'Corey LaJoie', car_number: 7, team_name: 'Spire Motorsports', is_active: true },
  { name: 'Cody Ware', car_number: 51, team_name: 'Rick Ware Racing', is_active: false },
  { name: 'BJ McLeod', car_number: 78, team_name: 'Live Fast Motorsports', is_active: false },
  { name: 'Josh Bilicki', car_number: 77, team_name: 'Spire Motorsports', is_active: false },
  { name: 'JJ Yeley', car_number: 15, team_name: 'Rick Ware Racing', is_active: false },
  { name: 'Landon Cassill', car_number: 77, team_name: 'Spire Motorsports', is_active: true },
  { name: 'Garrett Smithley', car_number: 53, team_name: 'Rick Ware Racing', is_active: false },
  { name: 'Greg Biffle', car_number: 44, team_name: 'NY Racing', is_active: false },
  { name: 'David Ragan', car_number: 15, team_name: 'Rick Ware Racing', is_active: false },
  { name: 'Jacques Villeneuve', car_number: 27, team_name: 'Team Hezeberg', is_active: false },
  { name: 'Loris Hezemans', car_number: 27, team_name: 'Team Hezeberg', is_active: false },
  { name: 'Boris Said', car_number: 66, team_name: 'MBM Motorsports', is_active: false },
  { name: 'Andy Lally', car_number: 78, team_name: 'Live Fast Motorsports', is_active: false },
  { name: 'Timmy Hill', car_number: 66, team_name: 'MBM Motorsports', is_active: false },
  { name: 'Joey Hand', car_number: 15, team_name: 'Rick Ware Racing', is_active: false },
  { name: 'Ryan Eversley', car_number: 27, team_name: 'Team Hezeberg', is_active: false },
];

export async function POST(request: NextRequest) {
  try {
    const { driverNames } = await request.json();
    const supabase = await createClient();

    // If specific names provided, filter to those; otherwise add all historical
    const driversToAdd = driverNames && Array.isArray(driverNames) && driverNames.length > 0
      ? HISTORICAL_DRIVERS.filter(d =>
          driverNames.some((name: string) =>
            d.name.toLowerCase() === name.toLowerCase()
          )
        )
      : HISTORICAL_DRIVERS;

    // Get existing drivers to avoid duplicates
    const { data: existing } = await supabase
      .from('drivers')
      .select('name');

    const existingNames = new Set((existing || []).map(d => d.name.toLowerCase()));

    // Filter out drivers that already exist
    const newDrivers = driversToAdd.filter(d => !existingNames.has(d.name.toLowerCase()));

    if (newDrivers.length === 0) {
      return NextResponse.json({
        message: 'All drivers already exist',
        added: 0
      });
    }

    // Insert new drivers
    const { error } = await supabase
      .from('drivers')
      .insert(newDrivers);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Added ${newDrivers.length} drivers`,
      added: newDrivers.length,
      drivers: newDrivers.map(d => d.name)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET to retrieve list of historical drivers we can add
export async function GET() {
  return NextResponse.json({ drivers: HISTORICAL_DRIVERS });
}
