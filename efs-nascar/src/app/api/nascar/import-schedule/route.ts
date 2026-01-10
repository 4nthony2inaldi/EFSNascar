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
        error: 'NASCAR API not configured',
        help: 'Add RAPIDAPI_KEY to your environment variables. Get your free key at https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/nascar-motorsport-api',
      }, { status: 503 });
    }

    const { year, forceDelete } = await request.json();

    if (!year || year < 2020 || year > 2030) {
      return NextResponse.json({ error: 'Valid year (2020-2030) is required' }, { status: 400 });
    }

    // Check if season already exists
    const { data: existingSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', year)
      .single();

    let seasonId: string;

    if (existingSeason) {
      seasonId = existingSeason.id;

      // Check if races already exist
      const { data: existingRaces } = await supabase
        .from('races')
        .select('id')
        .eq('season_id', seasonId);

      if (existingRaces && existingRaces.length > 0) {
        if (forceDelete) {
          // Delete race results first (foreign key constraint)
          for (const race of existingRaces) {
            await supabase.from('race_results').delete().eq('race_id', race.id);
          }
          // Delete existing races
          await supabase.from('races').delete().eq('season_id', seasonId);
          // Delete standings for this season
          await supabase.from('standings').delete().eq('season_id', seasonId);
          // Delete team season bonuses
          await supabase.from('team_season_bonuses').delete().eq('season_id', seasonId);
        } else {
          return NextResponse.json({
            error: `Season ${year} already has ${existingRaces.length} races. Delete them first to re-import.`,
            seasonId,
            racesCount: existingRaces.length,
          }, { status: 400 });
        }
      }
    } else {
      // Create the season
      const { data: newSeason, error: seasonError } = await supabase
        .from('seasons')
        .insert({
          year,
          name: `${year} Season`,
          start_date: `${year}-02-01`,
          end_date: `${year}-11-30`,
          is_active: false,
        })
        .select('id')
        .single();

      if (seasonError || !newSeason) {
        return NextResponse.json({
          error: `Failed to create season: ${seasonError?.message}`,
        }, { status: 500 });
      }

      seasonId = newSeason.id;
    }

    // Fetch schedule from Sportradar
    const apiRaces = await nascarApi.getRacesForYear(year);

    if (!apiRaces || apiRaces.length === 0) {
      return NextResponse.json({
        error: `No races found in API for year ${year}`,
      }, { status: 404 });
    }

    // Filter to only Cup Series point races (exclude All-Star, Clash, etc.)
    // and sort by date
    const sortedRaces = apiRaces
      .filter(r => r.scheduled) // Must have a scheduled date
      .sort((a, b) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime());

    // Insert races
    const racesToInsert = sortedRaces.map((race, index) => {
      const scheduledDate = new Date(race.scheduled);
      const deadlineDate = new Date(scheduledDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours before

      // Determine race type
      let raceType = 'regular';
      const raceName = race.name.toLowerCase();
      if (raceName.includes('all-star') || raceName.includes('clash')) {
        raceType = 'exhibition';
      }

      return {
        season_id: seasonId,
        race_number: index + 1,
        name: race.name,
        track: race.track?.name || 'Unknown Track',
        scheduled_datetime: scheduledDate.toISOString(),
        deadline_datetime: deadlineDate.toISOString(),
        race_type: raceType,
        status: race.status === 'closed' || race.status === 'complete' ? 'final' : 'upcoming',
      };
    });

    const { error: insertError } = await supabase
      .from('races')
      .insert(racesToInsert);

    if (insertError) {
      return NextResponse.json({
        error: `Failed to insert races: ${insertError.message}`,
      }, { status: 500 });
    }

    // Initialize standings for all teams
    const { data: teams } = await supabase.from('teams').select('id');

    if (teams && teams.length > 0) {
      const standingsToInsert = teams.map((team, index) => ({
        team_id: team.id,
        season_id: seasonId,
        race_id: null,
        total_points: 0,
        race_wins: 0,
        stage_wins: 0,
        top_10_bonuses: 0,
        rank: index + 1,
      }));

      await supabase.from('standings').insert(standingsToInsert);

      // Add team season bonuses
      const bonusesToInsert = teams.map(team => ({
        team_id: team.id,
        season_id: seasonId,
        bonus_usages: 1,
      }));

      await supabase.from('team_season_bonuses').insert(bonusesToInsert);
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${racesToInsert.length} races for ${year} season`,
      seasonId,
      racesImported: racesToInsert.length,
      races: racesToInsert.map(r => ({
        number: r.race_number,
        name: r.name,
        track: r.track,
        date: r.scheduled_datetime,
        status: r.status,
      })),
    });

  } catch (error: any) {
    console.error('Import schedule error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to import schedule',
    }, { status: 500 });
  }
}
