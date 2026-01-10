import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

// Helper to normalize race names for matching
function normalizeRaceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // remove special chars
    .replace(/\s+/g, ' ')        // normalize spaces
    .trim();
}

// Helper to extract key words from race name
function getRaceKeywords(name: string): string[] {
  const normalized = normalizeRaceName(name);
  // Filter out common words that don't help matching
  const stopWords = ['the', 'at', 'of', 'and', 'for', 'nascar', 'cup', 'series', 'race', 'presented', 'by'];
  return normalized.split(' ').filter(word =>
    word.length > 2 && !stopWords.includes(word)
  );
}

// Match races by comparing keywords
function findMatchingRace(dbRaceName: string, apiRaces: any[]): any | null {
  const dbKeywords = getRaceKeywords(dbRaceName);

  let bestMatch: any = null;
  let bestScore = 0;

  for (const apiRace of apiRaces) {
    const apiName = apiRace.raceName || apiRace.name || '';
    const apiTrack = apiRace.trackName || apiRace.track || '';
    const apiKeywords = [...getRaceKeywords(apiName), ...getRaceKeywords(apiTrack)];

    // Count matching keywords
    let score = 0;
    for (const dbWord of dbKeywords) {
      if (apiKeywords.some(apiWord => apiWord.includes(dbWord) || dbWord.includes(apiWord))) {
        score++;
      }
    }

    // Bonus for number matches (like "500" or "400")
    const dbNumbers: string[] = dbRaceName.match(/\d+/g) || [];
    const apiNumbers: string[] = (apiName + ' ' + apiTrack).match(/\d+/g) || [];
    for (const num of dbNumbers) {
      if (apiNumbers.includes(num)) {
        score += 2; // Numbers are strong indicators
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = apiRace;
    }
  }

  // Require at least some matching keywords
  return bestScore >= 2 ? bestMatch : null;
}

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
        help: 'Add RAPIDAPI_KEY to your environment variables.',
      }, { status: 503 });
    }

    const { year } = await request.json();

    if (!year) {
      return NextResponse.json({ error: 'Year is required' }, { status: 400 });
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
      // Also try last name only
      const lastName = d.name.split(' ').pop()?.toLowerCase();
      if (lastName) {
        driverByName.set(lastName, d.id);
      }
    });

    // Get season for the year
    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', year)
      .single();

    if (!season) {
      return NextResponse.json({ error: `No season found for year ${year}` }, { status: 404 });
    }

    // Get all races for the season
    const { data: allRaces } = await supabase
      .from('races')
      .select('id, name, race_number, season_id')
      .eq('season_id', season.id)
      .order('race_number');

    if (!allRaces || allRaces.length === 0) {
      return NextResponse.json({
        error: 'No races found for this season. Import the schedule first.',
        summary: { total: 0, success: 0, errors: 0, skipped: 0 },
        results: []
      }, { status: 404 });
    }

    // Check which races already have results
    const { data: existingResults } = await supabase
      .from('race_results')
      .select('race_id')
      .in('race_id', allRaces.map(r => r.id));

    const racesWithResults = new Set(existingResults?.map(r => r.race_id) || []);

    // Filter to races without results
    const racesToImport = allRaces.filter(race => !racesWithResults.has(race.id));

    if (racesToImport.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All races already have results imported',
        summary: { total: 0, success: 0, errors: 0, skipped: 0 },
        results: []
      });
    }

    // Fetch all season results from API at once
    let apiResults: any[];
    try {
      const seasonData = await nascarApi.getSeasonResults(year, 1); // Cup Series
      console.log('API Response type:', typeof seasonData, Array.isArray(seasonData));
      console.log('API Response sample:', JSON.stringify(seasonData).substring(0, 500));

      // Handle different response formats
      if (Array.isArray(seasonData)) {
        apiResults = seasonData;
      } else if (seasonData?.races) {
        apiResults = seasonData.races;
      } else if (seasonData?.results) {
        apiResults = seasonData.results;
      } else {
        apiResults = [];
      }
    } catch (err: any) {
      return NextResponse.json({
        error: `Failed to fetch results from API: ${err.message}`
      }, { status: 500 });
    }

    if (apiResults.length === 0) {
      return NextResponse.json({
        error: 'API returned no race data for this year',
        help: 'The API may not have results for this year yet.'
      }, { status: 404 });
    }

    console.log(`Found ${apiResults.length} races from API for ${year}`);
    console.log('API race names:', apiResults.map(r => r.raceName || r.name).join(', '));

    const results: Array<{
      race: string;
      status: 'success' | 'error' | 'skipped';
      message: string;
      resultsCount?: number;
    }> = [];

    for (const race of racesToImport) {
      // Find matching race in API results using keyword matching
      const apiRace = findMatchingRace(race.name, apiResults);

      if (!apiRace) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: 'Could not find matching race in API data',
        });
        continue;
      }

      // Get results from the matched race
      const raceResultsData = apiRace.results || apiRace.finishing_order || [];

      if (!raceResultsData || raceResultsData.length === 0) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: `Matched to "${apiRace.raceName || apiRace.name}" but no results available`,
        });
        continue;
      }

      try {
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

        // Find most laps led driver
        let maxLapsLed = 0;
        let mostLapsLedDriver = '';
        for (const result of raceResultsData) {
          const lapsLed = result.lapsLed || result.laps_led || 0;
          if (lapsLed > maxLapsLed) {
            maxLapsLed = lapsLed;
            mostLapsLedDriver = result.driverName || result.driver || '';
          }
        }

        // Get stage winners
        const stage1Winner = apiRace.stage1Winner || apiRace.stageWinners?.[0] || '';
        const stage2Winner = apiRace.stage2Winner || apiRace.stageWinners?.[1] || '';

        for (const result of raceResultsData) {
          const carNumber = parseInt(result.carNumber || result.car || result.number || '0');
          const driverName = result.driverName || result.driver || result.driver_name || '';
          const position = result.position || result.finishPosition || result.finish_position;
          const lapsLed = result.lapsLed || result.laps_led || 0;

          // Try to match driver by car number first, then by name
          let driverId = driverByCarNumber.get(carNumber);
          if (!driverId && driverName) {
            driverId = driverByName.get(driverName.toLowerCase());
            // Try last name only
            if (!driverId) {
              const lastName = driverName.split(' ').pop()?.toLowerCase();
              if (lastName) {
                driverId = driverByName.get(lastName);
              }
            }
          }

          if (!driverId || !position) continue;

          const isStage1Winner = stage1Winner && driverName.toLowerCase().includes(stage1Winner.toLowerCase());
          const isStage2Winner = stage2Winner && driverName.toLowerCase().includes(stage2Winner.toLowerCase());
          const isMostLapsLed = mostLapsLedDriver && driverName === mostLapsLedDriver && maxLapsLed > 0;

          raceResults.push({
            race_id: race.id,
            driver_id: driverId,
            finish_position: position,
            stage_1_winner: isStage1Winner || false,
            stage_2_winner: isStage2Winner || false,
            laps_led: lapsLed,
            most_laps_led: isMostLapsLed || false,
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
          message: `Matched "${apiRace.raceName || apiRace.name}" - imported ${raceResults.length} results`,
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
