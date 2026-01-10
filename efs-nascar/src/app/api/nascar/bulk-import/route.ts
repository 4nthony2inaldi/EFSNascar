import { createClient } from '@/lib/supabase/server';
import { nascarApi } from '@/lib/nascar-api';
import { NextResponse } from 'next/server';

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

  return bestScore >= 1 ? bestMatch : null;
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

    // Build driver lookup by name (various formats)
    const driverByName = new Map<string, { id: string; name: string; car_number: number }>();
    for (const d of drivers) {
      const nameLower = safeToLower(d.name);
      driverByName.set(nameLower, d);
      // Also add by last name
      const lastName = d.name?.split(' ').pop();
      if (lastName) {
        driverByName.set(safeToLower(lastName), d);
      }
      // Add by first name + last initial pattern (e.g., "Kyle L.")
      const parts = d.name?.split(' ');
      if (parts && parts.length >= 2) {
        const firstLast = `${parts[0]} ${parts[parts.length - 1][0]}`.toLowerCase();
        driverByName.set(firstLast, d);
      }
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

    // Fetch season results from API (this gives us winners)
    let apiRaces: any[] = [];
    try {
      const seasonData = await nascarApi.getSeasonResults(year, 1);
      console.log('Season data type:', typeof seasonData, Array.isArray(seasonData));

      if (Array.isArray(seasonData)) {
        apiRaces = seasonData;
      } else if (seasonData?.races) {
        apiRaces = seasonData.races;
      } else if (seasonData?.results) {
        apiRaces = seasonData.results;
      }

      console.log(`Got ${apiRaces.length} races from API`);
      if (apiRaces.length > 0) {
        console.log('Sample race:', JSON.stringify(apiRaces[0]));
      }
    } catch (err: any) {
      return NextResponse.json({
        error: `Failed to fetch results from API: ${err.message}`
      }, { status: 500 });
    }

    if (apiRaces.length === 0) {
      return NextResponse.json({
        error: 'API returned no race data for this year',
      }, { status: 404 });
    }

    // Process each race - import winner as position 1
    const results: Array<{
      race: string;
      status: 'success' | 'error' | 'skipped';
      message: string;
      resultsCount?: number;
    }> = [];

    for (const race of racesToImport) {
      // Find matching API race
      let matchedApiRace: any = null;
      for (const apiRace of apiRaces) {
        const apiRaceName = apiRace.raceName || apiRace.name || '';
        const matched = matchRaceToDb(apiRaceName, [race]);
        if (matched) {
          matchedApiRace = apiRace;
          break;
        }
      }

      if (!matchedApiRace) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: 'Could not match to API race data',
        });
        continue;
      }

      // Get winner from API
      const winnerName = matchedApiRace.winner;
      const apiRaceName = matchedApiRace.raceName || matchedApiRace.name;

      if (!winnerName) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: `Matched "${apiRaceName}" but no winner data available`,
        });
        continue;
      }

      // Find driver in our database
      const winnerLower = safeToLower(winnerName);
      let winnerDriver = driverByName.get(winnerLower);

      // Try partial matches if exact match fails
      if (!winnerDriver) {
        for (const [key, driver] of driverByName.entries()) {
          if (winnerLower.includes(key) || key.includes(winnerLower)) {
            winnerDriver = driver;
            break;
          }
        }
      }

      if (!winnerDriver) {
        results.push({
          race: race.name,
          status: 'skipped',
          message: `Winner "${winnerName}" not found in driver database`,
        });
        continue;
      }

      try {
        // Delete any existing results for this race
        await supabase.from('race_results').delete().eq('race_id', race.id);

        // Insert winner as position 1
        const { error: insertError } = await supabase
          .from('race_results')
          .insert({
            race_id: race.id,
            driver_id: winnerDriver.id,
            finish_position: 1,
            stage_1_winner: false,
            stage_2_winner: false,
            laps_led: 0,
            most_laps_led: false,
          });

        if (insertError) {
          results.push({
            race: race.name,
            status: 'error',
            message: `Database error: ${insertError.message}`,
          });
          continue;
        }

        // Update race status to final
        await supabase
          .from('races')
          .update({ status: 'final' })
          .eq('id', race.id);

        results.push({
          race: race.name,
          status: 'success',
          message: `Winner: ${winnerDriver.name} (#${winnerDriver.car_number})`,
          resultsCount: 1,
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
      message: 'Note: RapidAPI only provides race winners, not full finishing positions. Consider using a different data source for complete results.',
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
