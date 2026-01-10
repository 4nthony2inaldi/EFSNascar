import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

// Helper to delay between API calls to avoid rate limits
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to safely convert to string and lowercase
function safeToLower(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number') return value.toString();
  return '';
}

// Helper to normalize race names for matching
function normalizeRaceName(name: unknown): string {
  const str = safeToLower(name);
  return str
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

// Match API race to DB race by comparing keywords
function matchRaceToDb(apiRaceName: string, dbRaces: { id: string; name: string; race_number: number }[]): { id: string; name: string; race_number: number } | null {
  const apiKeywords = getRaceKeywords(apiRaceName);

  let bestMatch: { id: string; name: string; race_number: number } | null = null;
  let bestScore = 0;

  for (const dbRace of dbRaces) {
    const dbKeywords = getRaceKeywords(dbRace.name);

    // Count matching keywords
    let score = 0;
    for (const apiWord of apiKeywords) {
      if (dbKeywords.some(dbWord => dbWord.includes(apiWord) || apiWord.includes(dbWord))) {
        score++;
      }
    }

    // Bonus for number matches (like "500" or "400")
    const apiNumbers: string[] = apiRaceName.match(/\d+/g) || [];
    const dbNumbers: string[] = dbRace.name.match(/\d+/g) || [];
    for (const num of apiNumbers) {
      if (dbNumbers.includes(num)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = dbRace;
    }
  }

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

    // Get drivers from database
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, car_number');

    if (!drivers || drivers.length === 0) {
      return NextResponse.json({ error: 'No drivers found in database' }, { status: 400 });
    }

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
    const racesToImport = allRaces.filter(race => !racesWithResults.has(race.id));

    if (racesToImport.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All races already have results imported',
        summary: { total: 0, success: 0, errors: 0, skipped: 0 },
        results: []
      });
    }

    // Get season race data from API to get winners and find driver IDs
    let apiRaces: any[] = [];
    try {
      const seasonData = await nascarApi.getSeasonResults(year, 1);
      if (Array.isArray(seasonData)) {
        apiRaces = seasonData;
      } else if (seasonData?.races) {
        apiRaces = seasonData.races;
      } else if (seasonData?.results) {
        apiRaces = seasonData.results;
      }
    } catch (err: any) {
      console.error('Failed to fetch season results:', err.message);
    }

    console.log(`Found ${apiRaces.length} races from API, ${racesToImport.length} races need results`);

    // Build a map of race results: race_id -> { driver_id -> result data }
    const raceResultsMap = new Map<string, Map<string, {
      finish_position: number;
      laps_led: number;
    }>>();

    // Initialize the map for all races we need to import
    for (const race of racesToImport) {
      raceResultsMap.set(race.id, new Map());
    }

    // Strategy: For each driver, try to fetch their race results for the year
    // The API /race-results endpoint might use car number as driverId
    const driverResults: Array<{ driver: string; status: 'success' | 'error'; message: string }> = [];

    for (const driver of drivers) {
      // Try different formats for driverId
      const driverNameLower = safeToLower(driver.name);
      const possibleIds = [
        driver.car_number.toString(),
        driverNameLower.replace(/\s+/g, '-'),
        driverNameLower.replace(/\s+/g, ''),
      ].filter(id => id); // Filter out empty strings

      let foundResults = false;

      for (const driverId of possibleIds) {
        try {
          await delay(1100); // Rate limiting

          const driverRaceResults = await nascarApi.getDriverRaceResults(driverId, year);
          console.log(`Driver ${driver.name} (tried id: ${driverId}) response:`, JSON.stringify(driverRaceResults).substring(0, 300));

          // Check if we got results
          const resultsArray = Array.isArray(driverRaceResults)
            ? driverRaceResults
            : driverRaceResults?.results || driverRaceResults?.races || [];

          if (resultsArray.length > 0) {
            foundResults = true;

            // Process each race result for this driver
            for (const result of resultsArray) {
              const raceName = result.raceName || result.race || result.name || '';
              const position = result.position || result.finishPosition || result.finish_position;

              if (!raceName || !position) continue;

              // Find matching DB race
              const matchedRace = matchRaceToDb(raceName, racesToImport);
              if (matchedRace) {
                const raceResults = raceResultsMap.get(matchedRace.id);
                if (raceResults) {
                  raceResults.set(driver.id, {
                    finish_position: parseInt(position),
                    laps_led: result.lapsLed || result.laps_led || 0,
                  });
                }
              }
            }

            driverResults.push({
              driver: driver.name,
              status: 'success',
              message: `Found ${resultsArray.length} race results`,
            });
            break; // Found results, move to next driver
          }
        } catch (err: any) {
          console.log(`Driver ${driver.name} id ${driverId} failed: ${err.message}`);
          // Continue to try next ID format
        }
      }

      if (!foundResults) {
        driverResults.push({
          driver: driver.name,
          status: 'error',
          message: 'Could not fetch results from API',
        });
      }
    }

    // Now also use the winner info from /results to fill in position 1
    for (const apiRace of apiRaces) {
      const winnerRaw = apiRace.winner;
      if (!winnerRaw) continue;

      // Safely get winner name as string
      const winner = typeof winnerRaw === 'string' ? winnerRaw : String(winnerRaw);
      const winnerLower = safeToLower(winner);
      if (!winnerLower) continue;

      const matchedRace = matchRaceToDb(apiRace.raceName || apiRace.name || '', racesToImport);
      if (!matchedRace) continue;

      // Find driver by name
      const winnerDriver = drivers.find(d => {
        const driverNameLower = safeToLower(d.name);
        const lastName = safeToLower(d.name?.split(' ').pop() || '');
        return (
          driverNameLower === winnerLower ||
          driverNameLower.includes(winnerLower) ||
          winnerLower.includes(lastName)
        );
      });

      if (winnerDriver) {
        const raceResults = raceResultsMap.get(matchedRace.id);
        if (raceResults && !raceResults.has(winnerDriver.id)) {
          raceResults.set(winnerDriver.id, {
            finish_position: 1,
            laps_led: 0,
          });
        }
      }
    }

    // Now insert the results for each race
    const results: Array<{
      race: string;
      status: 'success' | 'error' | 'skipped';
      message: string;
      resultsCount?: number;
    }> = [];

    for (const race of racesToImport) {
      const raceResults = raceResultsMap.get(race.id);

      if (!raceResults || raceResults.size === 0) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: 'No driver results found for this race',
        });
        continue;
      }

      try {
        // Convert map to insert format
        const resultsToInsert = Array.from(raceResults.entries()).map(([driverId, data]) => ({
          race_id: race.id,
          driver_id: driverId,
          finish_position: data.finish_position,
          stage_1_winner: false,
          stage_2_winner: false,
          laps_led: data.laps_led,
          most_laps_led: false,
        }));

        // Delete existing results
        await supabase.from('race_results').delete().eq('race_id', race.id);

        // Insert new results
        const { error: insertError } = await supabase
          .from('race_results')
          .insert(resultsToInsert);

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
          message: `Imported ${resultsToInsert.length} driver results`,
          resultsCount: resultsToInsert.length,
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
      driverStatus: driverResults,
    });

  } catch (error: any) {
    console.error('Bulk import error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to import results',
    }, { status: 500 });
  }
}
