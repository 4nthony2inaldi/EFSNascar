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

    // Match drivers by car number (most reliable)
    const driverMap = new Map<number, string>();
    drivers.forEach(d => {
      driverMap.set(d.car_number, d.id);
    });

    // Also create a name-based lookup as fallback
    const driverNameMap = new Map<string, string>();
    drivers.forEach(d => {
      driverNameMap.set(d.name.toLowerCase(), d.id);
    });

    // Convert to race_results format
    const raceResults: Array<{
      race_id: string;
      driver_id: string;
      finish_position: number;
      stage_1_winner: boolean;
      stage_2_winner: boolean;
      laps_led: number;
      most_laps_led: boolean;
    }> = [];

    const unmatchedDrivers: string[] = [];

    for (const result of transformedData.results) {
      // Try to find driver by car number first
      let driverId = driverMap.get(result.carNumber);

      // Fallback to name match
      if (!driverId) {
        driverId = driverNameMap.get(result.driverName.toLowerCase());
      }

      if (!driverId) {
        unmatchedDrivers.push(`#${result.carNumber} ${result.driverName}`);
        continue;
      }

      raceResults.push({
        race_id,
        driver_id: driverId,
        finish_position: result.finishPosition,
        stage_1_winner: result.isStage1Winner,
        stage_2_winner: result.isStage2Winner,
        laps_led: result.lapsLed,
        most_laps_led: result.isMostLapsLed,
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
        mostLapsLed: transformedData.mostLapsLedDriver,
      },
      warnings: unmatchedDrivers.length > 0 ? {
        unmatchedDrivers,
        message: 'Some drivers could not be matched to your database. You may need to add them manually.',
      } : undefined,
    });
  } catch (error: any) {
    console.error('Error fetching NASCAR results:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch results',
    }, { status: 500 });
  }
}
