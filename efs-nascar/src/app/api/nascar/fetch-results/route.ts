import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verify user is commissioner
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_commissioner')
      .eq('id', user.id)
      .single();

    if (!profile?.is_commissioner) {
      return NextResponse.json({ error: 'Forbidden - Commissioner access required' }, { status: 403 });
    }

    // Check if API is configured
    if (!nascarApi.isConfigured()) {
      return NextResponse.json({
        error: 'NASCAR API not configured. Add SPORTRADAR_API_KEY to your environment variables.',
        help: 'Get your free trial key at https://developer.sportradar.com/',
      }, { status: 503 });
    }

    const { race_id, sportradar_race_id, year, race_name } = await request.json();

    if (!race_id) {
      return NextResponse.json({ error: 'race_id is required' }, { status: 400 });
    }

    let apiRaceId = sportradar_race_id;

    // If no Sportradar race ID provided, try to find it by name
    if (!apiRaceId && year && race_name) {
      const race = await nascarApi.findRaceByName(year, race_name);
      if (race) {
        apiRaceId = race.id;
      } else {
        return NextResponse.json({
          error: `Could not find race "${race_name}" in ${year} schedule`,
        }, { status: 404 });
      }
    }

    if (!apiRaceId) {
      return NextResponse.json({
        error: 'Either sportradar_race_id or (year + race_name) is required',
      }, { status: 400 });
    }

    // Fetch results from Sportradar
    const raceData = await nascarApi.getRaceResults(apiRaceId);

    if (!raceData.results || raceData.results.length === 0) {
      return NextResponse.json({
        error: 'Race results not yet available',
        status: raceData.status,
      }, { status: 400 });
    }

    // Transform results
    const transformedData = nascarApi.transformRaceResults(raceData);

    // Get our drivers from the database
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, car_number');

    if (!drivers || drivers.length === 0) {
      return NextResponse.json({ error: 'No drivers found in database' }, { status: 400 });
    }

    // Helper to normalize names for matching
    const normalizeName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/[^a-z\s]/g, '') // Remove non-alpha characters
        .replace(/\s+/g, ' ')     // Normalize spaces
        .trim();
    };

    // Helper to get last name
    const getLastName = (name: string): string => {
      const parts = name.trim().split(/\s+/);
      return parts[parts.length - 1].toLowerCase();
    };

    // Build name-based lookups (PRIMARY matching method)
    const driverByExactName = new Map<string, { id: string; name: string; car_number: number }>();
    const driverByNormalizedName = new Map<string, { id: string; name: string; car_number: number }>();
    const driverByLastName = new Map<string, { id: string; name: string; car_number: number }[]>();

    for (const d of drivers) {
      // Exact lowercase match
      driverByExactName.set(d.name.toLowerCase(), d);
      // Normalized match (no punctuation, normalized spaces)
      driverByNormalizedName.set(normalizeName(d.name), d);
      // Last name match (for partial matching)
      const lastName = getLastName(d.name);
      if (!driverByLastName.has(lastName)) {
        driverByLastName.set(lastName, []);
      }
      driverByLastName.get(lastName)!.push(d);
    }

    // Car number lookup (FALLBACK only - used when name doesn't match)
    const driverByCarNumber = new Map<number, { id: string; name: string; car_number: number }>();
    drivers.forEach(d => {
      driverByCarNumber.set(d.car_number, d);
    });

    // Function to find driver - NAME FIRST, then car number as fallback
    const findDriver = (apiName: string, carNumber: number): { id: string; name: string; car_number: number } | null => {
      // 1. Try exact name match
      const exactMatch = driverByExactName.get(apiName.toLowerCase());
      if (exactMatch) return exactMatch;

      // 2. Try normalized name match
      const normalizedMatch = driverByNormalizedName.get(normalizeName(apiName));
      if (normalizedMatch) return normalizedMatch;

      // 3. Try last name match (if unique)
      const lastName = getLastName(apiName);
      const lastNameMatches = driverByLastName.get(lastName);
      if (lastNameMatches && lastNameMatches.length === 1) {
        return lastNameMatches[0];
      }

      // 4. Try last name + car number combo (for cases like multiple Smiths)
      if (lastNameMatches && lastNameMatches.length > 1) {
        const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
        if (carMatch) return carMatch;
      }

      // 5. FALLBACK: Car number only (when name matching fails completely)
      const carNumberMatch = driverByCarNumber.get(carNumber);
      if (carNumberMatch) return carNumberMatch;

      return null;
    };

    // Convert to race_results format
    const raceResults: Array<{
      race_id: string;
      driver_id: string;
      finish_position: number;
      stage_1_winner: boolean;
      stage_2_winner: boolean;
      laps_led: number;
      most_laps_led: boolean;
      api_driver_name: string;
      api_car_number: number;
    }> = [];

    const unmatchedDrivers: string[] = [];
    const matchedByFallback: string[] = [];

    for (const result of transformedData.results) {
      const matchedDriver = findDriver(result.driverName, result.carNumber);

      if (!matchedDriver) {
        unmatchedDrivers.push(`#${result.carNumber} ${result.driverName}`);
        continue;
      }

      // Track if we used car number fallback (name didn't match)
      const nameMatched = driverByExactName.has(result.driverName.toLowerCase()) ||
                          driverByNormalizedName.has(normalizeName(result.driverName));
      if (!nameMatched) {
        matchedByFallback.push(`#${result.carNumber} ${result.driverName} -> ${matchedDriver.name}`);
      }

      raceResults.push({
        race_id,
        driver_id: matchedDriver.id,
        finish_position: result.finishPosition,
        stage_1_winner: result.isStage1Winner,
        stage_2_winner: result.isStage2Winner,
        stage_3_winner: result.isStage3Winner,
        laps_led: result.lapsLed,
        most_laps_led: result.isMostLapsLed,
        api_driver_name: result.driverName,
        api_car_number: result.carNumber,
      });
    }

    // Delete existing results for this race
    await supabase.from('race_results').delete().eq('race_id', race_id);

    // Insert new results
    if (raceResults.length > 0) {
      const { error: insertError } = await supabase
        .from('race_results')
        .insert(raceResults);

      if (insertError) {
        console.error('Error inserting results:', insertError);
        return NextResponse.json({ error: 'Failed to save results' }, { status: 500 });
      }
    }

    // Update race status to final
    await supabase
      .from('races')
      .update({ status: 'final' })
      .eq('id', race_id);

    return NextResponse.json({
      success: true,
      message: `Imported ${raceResults.length} results from ${transformedData.raceName}`,
      raceInfo: {
        name: transformedData.raceName,
        track: transformedData.trackName,
        date: transformedData.raceDate,
        resultsCount: raceResults.length,
        stage1Winner: transformedData.stage1Winner,
        stage2Winner: transformedData.stage2Winner,
        stage3Winner: transformedData.stage3Winner,
        mostLapsLed: transformedData.mostLapsLedDriver,
      },
      warnings: unmatchedDrivers.length > 0 || matchedByFallback.length > 0 ? {
        unmatchedDrivers: unmatchedDrivers.length > 0 ? unmatchedDrivers : undefined,
        matchedByCarNumberOnly: matchedByFallback.length > 0 ? matchedByFallback : undefined,
        message: unmatchedDrivers.length > 0
          ? 'Some drivers could not be matched. You may need to add them manually.'
          : 'Some drivers were matched by car number only (name not found in database).',
      } : undefined,
    });
  } catch (error: any) {
    console.error('Error fetching NASCAR results:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch results',
    }, { status: 500 });
  }
}
