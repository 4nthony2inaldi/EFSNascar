import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

// Rate limit: Sportradar allows 1 request per second on trial
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        error: 'NASCAR API not configured',
        help: 'Add SPORTRADAR_API_KEY to your environment variables.',
      }, { status: 503 });
    }

    const { year, race_ids } = await request.json();

    if (!year && !race_ids) {
      return NextResponse.json({
        error: 'Either year or race_ids is required'
      }, { status: 400 });
    }

    // Get drivers from database for matching
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, car_number');

    if (!drivers || drivers.length === 0) {
      return NextResponse.json({ error: 'No drivers found in database' }, { status: 400 });
    }

    // Build driver lookup maps
    const driverByCarNumber = new Map<number, string>();
    const driverByName = new Map<string, string>();
    drivers.forEach(d => {
      driverByCarNumber.set(d.car_number, d.id);
      driverByName.set(d.name.toLowerCase(), d.id);
    });

    // Get races to import
    let racesToImport: Array<{ id: string; name: string; race_number: number; season_id: string }> = [];

    if (race_ids) {
      const { data: races } = await supabase
        .from('races')
        .select('id, name, race_number, season_id')
        .in('id', race_ids)
        .order('race_number');
      racesToImport = races || [];
    } else if (year) {
      // Get season for the year
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('year', year)
        .single();

      if (!season) {
        return NextResponse.json({ error: `No season found for year ${year}` }, { status: 404 });
      }

      // Get all races for the season that aren't final
      const { data: races } = await supabase
        .from('races')
        .select('id, name, race_number, season_id')
        .eq('season_id', season.id)
        .neq('status', 'final')
        .order('race_number');

      racesToImport = races || [];
    }

    if (racesToImport.length === 0) {
      return NextResponse.json({
        message: 'No races to import (all may already be final)',
        imported: 0
      });
    }

    // Get the Sportradar schedule for the year
    const scheduleYear = year || new Date().getFullYear();
    let apiSchedule;
    try {
      apiSchedule = await nascarApi.getRacesForYear(scheduleYear);
    } catch (err: any) {
      return NextResponse.json({
        error: `Failed to fetch schedule from API: ${err.message}`
      }, { status: 500 });
    }

    const results: Array<{
      race: string;
      status: 'success' | 'error' | 'skipped';
      message: string;
      resultsCount?: number;
    }> = [];

    for (const race of racesToImport) {
      // Find matching race in API schedule
      const apiRace = apiSchedule.find(r => {
        const nameMatch = r.name.toLowerCase().includes(race.name.toLowerCase()) ||
                         race.name.toLowerCase().includes(r.name.toLowerCase());
        return nameMatch;
      });

      if (!apiRace) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: 'Could not find matching race in API schedule',
        });
        continue;
      }

      // Check if race is complete
      if (apiRace.status !== 'closed' && apiRace.status !== 'complete') {
        results.push({
          race: race.name,
          status: 'skipped',
          message: `Race status is "${apiRace.status}" - not yet complete`,
        });
        continue;
      }

      // Rate limit
      await delay(1100);

      try {
        // Fetch race results
        const raceData = await nascarApi.getRaceResults(apiRace.id);

        if (!raceData.results || raceData.results.length === 0) {
          results.push({
            race: race.name,
            status: 'skipped',
            message: 'No results available from API',
          });
          continue;
        }

        // Transform results
        const transformedData = nascarApi.transformRaceResults(raceData);

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

        for (const result of transformedData.results) {
          let driverId = driverByCarNumber.get(result.carNumber);
          if (!driverId) {
            driverId = driverByName.get(result.driverName.toLowerCase());
          }

          if (!driverId) continue;

          raceResults.push({
            race_id: race.id,
            driver_id: driverId,
            finish_position: result.finishPosition,
            stage_1_winner: result.isStage1Winner,
            stage_2_winner: result.isStage2Winner,
            laps_led: result.lapsLed,
            most_laps_led: result.isMostLapsLed,
          });
        }

        if (raceResults.length === 0) {
          results.push({
            race: race.name,
            status: 'error',
            message: 'No drivers could be matched to database',
          });
          continue;
        }

        // Delete existing results
        await supabase.from('race_results').delete().eq('race_id', race.id);

        // Insert new results
        const { error: insertError } = await supabase
          .from('race_results')
          .insert(raceResults);

        if (insertError) {
          results.push({
            race: race.name,
            status: 'error',
            message: `Database error: ${insertError.message}`,
          });
          continue;
        }

        // Update race status
        await supabase
          .from('races')
          .update({ status: 'final' })
          .eq('id', race.id);

        results.push({
          race: race.name,
          status: 'success',
          message: `Imported ${raceResults.length} driver results`,
          resultsCount: raceResults.length,
        });

      } catch (err: any) {
        results.push({
          race: race.name,
          status: 'error',
          message: err.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        success: successCount,
        errors: errorCount,
        skipped: skippedCount,
      },
      results,
    });

  } catch (error: any) {
    console.error('Bulk import error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to import results',
    }, { status: 500 });
  }
}
