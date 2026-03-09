import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { refreshDriverTiersCache } from '@/lib/cachedData';

// NASCAR API base URLs
const SCHEDULE_URL = (year: number) =>
  `https://cf.nascar.com/cacher/${year}/1/schedule-feed.json`;
const WEEKEND_FEED_URL = (year: number, raceId: number) =>
  `https://cf.nascar.com/cacher/${year}/1/${raceId}/weekend-feed.json`;

// Map alternate names in NASCAR API to the canonical database name
const DRIVER_NAME_ALIASES: Record<string, string> = {
  'darrell wallace jr': 'bubba wallace',
  'darrell "bubba" wallace jr': 'bubba wallace',
  'darrell wallace jr.': 'bubba wallace',
};

function normalizeDriverName(name: string): string {
  const lower = name.toLowerCase().trim();
  const alias = DRIVER_NAME_ALIASES[lower];
  const canonical = alias || lower;
  return canonical.replace(/[^a-z]/g, '');
}

function normalizeTrackName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface NascarScheduleEntry {
  race_id: number;
  race_name: string;
  track_name: string;
  run_type: number; // 3 = race
  start_time_utc: string;
}

interface NascarWeekendResult {
  finishing_position: number;
  starting_position: number;
  driver_fullname: string;
  car_number: string;
  team_name: string;
  laps_led: number;
  laps_completed: number;
  finishing_status: string;
}

interface NascarStageResult {
  stage_number: number;
  driver_fullname: string;
  finishing_position: number;
  car_number: string;
}

interface NascarWeekendFeed {
  race_id: number;
  race_name: string;
  track_name: string;
  race_results: NascarWeekendResult[];
  stage_results?: NascarStageResult[][];
}

// GET: Fetch NASCAR schedule and list available races
export async function GET(request: NextRequest) {
  const year = request.nextUrl.searchParams.get('year');

  if (!year) {
    return NextResponse.json({ error: 'year query param is required' }, { status: 400 });
  }

  try {
    const scheduleRes = await fetch(SCHEDULE_URL(Number(year)));
    if (!scheduleRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch NASCAR schedule: ${scheduleRes.status}` },
        { status: 502 }
      );
    }

    const schedule: NascarScheduleEntry[] = await scheduleRes.json();

    // Filter to actual races only (run_type 3), exclude non-points events
    const races = schedule
      .filter((e) => e.run_type === 3)
      .map((e) => ({
        race_id: e.race_id,
        race_name: e.race_name,
        track_name: e.track_name,
        date: e.start_time_utc,
      }));

    return NextResponse.json({ year: Number(year), races });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Fetch results from NASCAR API and import into database
export async function POST(request: NextRequest) {
  try {
    const { year, nascarRaceId, dbRaceId } = await request.json();

    if (!year || !nascarRaceId || !dbRaceId) {
      return NextResponse.json(
        { error: 'year, nascarRaceId, and dbRaceId are required' },
        { status: 400 }
      );
    }

    // Fetch weekend feed from NASCAR API
    const feedUrl = WEEKEND_FEED_URL(year, nascarRaceId);
    const feedRes = await fetch(feedUrl);
    if (!feedRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch NASCAR weekend feed (${feedRes.status}). Race results may not be available yet.` },
        { status: 502 }
      );
    }

    const feedData = await feedRes.json();

    // Extract race results - the weekend feed has various structures
    const raceResults: NascarWeekendResult[] = feedData.race_results || [];
    if (raceResults.length === 0) {
      return NextResponse.json(
        { error: 'No race results found in NASCAR feed. The race may not have been completed yet.' },
        { status: 400 }
      );
    }

    // Extract stage results
    const allStageResults: NascarStageResult[] = [];
    if (feedData.stage_results) {
      // stage_results can be an array of arrays or object
      if (Array.isArray(feedData.stage_results)) {
        for (const stageArr of feedData.stage_results) {
          if (Array.isArray(stageArr)) {
            allStageResults.push(...stageArr);
          }
        }
      }
    }

    // Build stage winners map: { normalizedName -> { s1: bool, s2: bool, s3: bool } }
    const stageWinners: Record<string, { s1: boolean; s2: boolean; s3: boolean }> = {};
    for (const sr of allStageResults) {
      if (sr.finishing_position === 1) {
        const normName = normalizeDriverName(sr.driver_fullname);
        if (!stageWinners[normName]) {
          stageWinners[normName] = { s1: false, s2: false, s3: false };
        }
        if (sr.stage_number === 1) stageWinners[normName].s1 = true;
        if (sr.stage_number === 2) stageWinners[normName].s2 = true;
        if (sr.stage_number === 3) stageWinners[normName].s3 = true;
      }
    }

    // Setup Supabase client
    const adminClient = createAdminClient();
    const regularClient = await createClient();
    const supabase = adminClient || regularClient;

    // Get all drivers from database
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, name');

    if (driversError) {
      return NextResponse.json({ error: driversError.message }, { status: 500 });
    }

    // Create driver name lookup map
    const driverMap = new Map<string, string>();
    for (const driver of drivers || []) {
      driverMap.set(normalizeDriverName(driver.name), driver.id);
    }

    // Delete existing results for this race
    await supabase.from('race_results').delete().eq('race_id', dbRaceId);

    // Find max laps led for most_laps_led calculation
    const maxLapsLed = Math.max(...raceResults.map((r) => r.laps_led || 0));

    let imported = 0;
    let skipped = 0;
    const driversNotFound: string[] = [];
    const insertErrors: string[] = [];
    const importedResults: Array<{ position: number; driver: string; lapsLed: number; stages: string }> = [];

    for (const result of raceResults) {
      if (!result.finishing_position) {
        skipped++;
        continue;
      }

      const normName = normalizeDriverName(result.driver_fullname);
      const driverId = driverMap.get(normName);

      if (!driverId) {
        if (!driversNotFound.includes(result.driver_fullname)) {
          driversNotFound.push(result.driver_fullname);
        }
        skipped++;
        continue;
      }

      const sw = stageWinners[normName] || { s1: false, s2: false, s3: false };
      const lapsLed = result.laps_led || 0;
      const mostLapsLed = lapsLed > 0 && lapsLed === maxLapsLed;
      const carNumber = parseInt(String(result.car_number).replace(/\D/g, '') || '0', 10) || null;

      const { error: insertError } = await supabase.from('race_results').insert({
        race_id: dbRaceId,
        driver_id: driverId,
        finish_position: result.finishing_position,
        stage_1_winner: sw.s1,
        stage_2_winner: sw.s2,
        stage_3_winner: sw.s3,
        laps_led: lapsLed,
        most_laps_led: mostLapsLed,
        api_driver_name: result.driver_fullname,
        api_car_number: carNumber,
      });

      if (insertError) {
        console.error(`Error inserting result for ${result.driver_fullname}:`, insertError);
        if (insertErrors.length < 5) {
          insertErrors.push(`${result.driver_fullname}: ${insertError.message || insertError.code}`);
        }
        skipped++;
      } else {
        imported++;
        const stageFlags = [sw.s1 ? 'S1' : '', sw.s2 ? 'S2' : '', sw.s3 ? 'S3' : ''].filter(Boolean).join(',');
        importedResults.push({
          position: result.finishing_position,
          driver: result.driver_fullname,
          lapsLed: lapsLed,
          stages: stageFlags || '-',
        });
      }
    }

    // Update race status to 'final'
    await supabase.from('races').update({ status: 'final' }).eq('id', dbRaceId);

    // Refresh driver tiers cache
    try {
      await refreshDriverTiersCache();
    } catch (e) {
      console.error('Failed to refresh cache:', e);
    }

    return NextResponse.json({
      success: true,
      nascarRaceId,
      dbRaceId,
      raceName: feedData.race_name || 'Unknown',
      trackName: feedData.track_name || 'Unknown',
      imported,
      skipped,
      driversNotFound,
      insertErrors: insertErrors.length > 0 ? insertErrors : undefined,
      stageWinners: Object.entries(stageWinners).map(([name, stages]) => ({
        driver: name,
        ...stages,
      })),
      results: importedResults.slice(0, 10), // Preview top 10
    });
  } catch (error: any) {
    console.error('NASCAR scrape error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
