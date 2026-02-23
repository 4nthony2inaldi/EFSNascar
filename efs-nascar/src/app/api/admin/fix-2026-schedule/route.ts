import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// Correct 2026 NASCAR Cup Series Schedule
const CORRECT_2026_SCHEDULE = [
  // REGULAR SEASON (Races 1-22, with race 13 as exhibition)
  { race_number: 1, name: 'Daytona 500', track: 'Daytona International Speedway', scheduled_datetime: '2026-02-15T14:30:00-05:00', race_type: 'regular' },
  { race_number: 2, name: 'Autotrader 400', track: 'Atlanta Motor Speedway', scheduled_datetime: '2026-02-22T15:00:00-05:00', race_type: 'regular' },
  { race_number: 3, name: 'EchoPark Automotive Grand Prix', track: 'Circuit of the Americas', scheduled_datetime: '2026-03-01T15:30:00-06:00', race_type: 'regular' },
  { race_number: 4, name: 'Shriners Children\'s 500', track: 'Phoenix Raceway', scheduled_datetime: '2026-03-08T15:30:00-07:00', race_type: 'regular' },
  { race_number: 5, name: 'Pennzoil 400', track: 'Las Vegas Motor Speedway', scheduled_datetime: '2026-03-15T15:30:00-07:00', race_type: 'regular' },
  { race_number: 6, name: 'Goodyear 400', track: 'Darlington Raceway', scheduled_datetime: '2026-03-22T15:00:00-04:00', race_type: 'regular' },
  { race_number: 7, name: 'Cook Out 400', track: 'Martinsville Speedway', scheduled_datetime: '2026-03-29T15:30:00-04:00', race_type: 'regular' },
  // OFF WEEK Apr 5
  { race_number: 8, name: 'Food City 500', track: 'Bristol Motor Speedway', scheduled_datetime: '2026-04-12T15:00:00-04:00', race_type: 'regular' },
  { race_number: 9, name: 'AdventHealth 400', track: 'Kansas Speedway', scheduled_datetime: '2026-04-19T14:00:00-05:00', race_type: 'regular' },
  { race_number: 10, name: 'GEICO 500', track: 'Talladega Superspeedway', scheduled_datetime: '2026-04-26T15:00:00-05:00', race_type: 'regular' },
  { race_number: 11, name: 'AutoTrader EchoPark Automotive 400', track: 'Texas Motor Speedway', scheduled_datetime: '2026-05-03T15:30:00-05:00', race_type: 'regular' },
  { race_number: 12, name: 'Go Bowling at The Glen', track: 'Watkins Glen International', scheduled_datetime: '2026-05-10T15:00:00-04:00', race_type: 'regular' },
  { race_number: 13, name: 'All-Star Race', track: 'Dover Motor Speedway', scheduled_datetime: '2026-05-17T15:00:00-04:00', race_type: 'exhibition' },
  { race_number: 14, name: 'Coca-Cola 600', track: 'Charlotte Motor Speedway', scheduled_datetime: '2026-05-24T18:00:00-04:00', race_type: 'regular' },
  { race_number: 15, name: 'Ally 400', track: 'Nashville Superspeedway', scheduled_datetime: '2026-05-31T19:00:00-05:00', race_type: 'regular' },
  { race_number: 16, name: 'FireKeepers Casino 400', track: 'Michigan International Speedway', scheduled_datetime: '2026-06-07T15:00:00-04:00', race_type: 'regular' },
  { race_number: 17, name: 'Great Pocono Raceway 400', track: 'Pocono Raceway', scheduled_datetime: '2026-06-14T15:00:00-04:00', race_type: 'regular' },
  { race_number: 18, name: 'NASCAR San Diego', track: 'Naval Base Coronado', scheduled_datetime: '2026-06-21T16:00:00-07:00', race_type: 'regular' },
  { race_number: 19, name: 'Toyota/Save Mart 350', track: 'Sonoma Raceway', scheduled_datetime: '2026-06-28T15:30:00-07:00', race_type: 'regular' },
  { race_number: 20, name: 'NASCAR Cup Series at Chicagoland', track: 'Chicagoland Speedway', scheduled_datetime: '2026-07-05T18:00:00-05:00', race_type: 'regular' },
  { race_number: 21, name: 'Quaker State 400', track: 'Atlanta Motor Speedway', scheduled_datetime: '2026-07-12T15:00:00-04:00', race_type: 'regular' },
  { race_number: 22, name: 'NASCAR Cup Series at North Wilkesboro', track: 'North Wilkesboro Speedway', scheduled_datetime: '2026-07-19T19:00:00-04:00', race_type: 'regular' },

  // FANTASY PLAYOFFS (Races 23-27)
  // Round 1: 1 race
  { race_number: 23, name: 'Brickyard 400', track: 'Indianapolis Motor Speedway', scheduled_datetime: '2026-07-26T14:00:00-04:00', race_type: 'playoff_round1' },
  // OFF WEEK Aug 2
  // Round 2: 2 races
  { race_number: 24, name: 'Iowa Corn 350', track: 'Iowa Speedway', scheduled_datetime: '2026-08-09T15:30:00-05:00', race_type: 'playoff_round2' },
  { race_number: 25, name: 'NASCAR Cup Series at Richmond', track: 'Richmond Raceway', scheduled_datetime: '2026-08-15T19:00:00-04:00', race_type: 'playoff_round2' },
  // Finals: 2 races
  { race_number: 26, name: 'USA Today 301', track: 'New Hampshire Motor Speedway', scheduled_datetime: '2026-08-23T15:00:00-04:00', race_type: 'playoff_finals' },
  { race_number: 27, name: 'Coke Zero Sugar 400', track: 'Daytona International Speedway', scheduled_datetime: '2026-08-29T19:30:00-04:00', race_type: 'playoff_finals' },
];

export async function POST() {
  try {
    const regularClient = await createClient();

    // Verify user is commissioner
    const { data: { user } } = await regularClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await regularClient
      .from('profiles')
      .select('is_commissioner')
      .eq('id', user.id)
      .single();

    if (!profile?.is_commissioner) {
      return NextResponse.json({ error: 'Forbidden - Commissioner access required' }, { status: 403 });
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();
    const supabase = adminClient || regularClient;

    // Ensure new tracks exist (Chicagoland and Naval Base Coronado are new for 2026)
    const newTracks = [
      { name: 'Chicagoland Speedway', short_name: 'Chicagoland', location: 'Joliet, IL', track_type: 'intermediate', length_miles: 1.500, banking_degrees: 18 },
      { name: 'Naval Base Coronado', short_name: 'San Diego', location: 'San Diego, CA', track_type: 'street_course', length_miles: 1.600, banking_degrees: 0 },
    ];

    for (const track of newTracks) {
      const { data: existing } = await supabase
        .from('tracks')
        .select('id')
        .eq('name', track.name)
        .single();

      if (!existing) {
        await supabase.from('tracks').insert(track);
      }
    }

    // Get 2026 season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id')
      .eq('year', 2026)
      .single();

    if (seasonError || !season) {
      return NextResponse.json({ error: 'Could not find 2026 season' }, { status: 404 });
    }

    const updates: string[] = [];
    const errors: string[] = [];

    // Build track name -> id lookup
    const { data: allTracks } = await supabase.from('tracks').select('id, name');
    const trackIdMap = new Map((allTracks || []).map(t => [t.name, t.id]));

    for (const race of CORRECT_2026_SCHEDULE) {
      const deadlineDt = new Date(new Date(race.scheduled_datetime).getTime() - 2 * 60 * 60 * 1000).toISOString();
      const trackId = trackIdMap.get(race.track) || null;

      const { error } = await supabase
        .from('races')
        .update({
          name: race.name,
          track: race.track,
          track_id: trackId,
          scheduled_datetime: race.scheduled_datetime,
          deadline_datetime: deadlineDt,
          race_type: race.race_type,
          updated_at: new Date().toISOString(),
        })
        .eq('season_id', season.id)
        .eq('race_number', race.race_number);

      if (error) {
        errors.push(`Race ${race.race_number}: ${error.message}`);
      } else {
        updates.push(`Race ${race.race_number}: ${race.name} @ ${race.track}${trackId ? '' : ' (no track_id match)'}`);
      }
    }

    return NextResponse.json({
      success: true,
      updated: updates.length,
      total: CORRECT_2026_SCHEDULE.length,
      updates,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error fixing schedule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
