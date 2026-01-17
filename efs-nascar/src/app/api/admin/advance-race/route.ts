import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { seasonId } = await request.json();

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
    }

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all races for this season ordered by race_number
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, race_number, name, status, deadline_datetime')
      .eq('season_id', seasonId)
      .order('race_number', { ascending: true });

    if (racesError) {
      return NextResponse.json({ error: racesError.message }, { status: 500 });
    }

    if (!races || races.length === 0) {
      return NextResponse.json({ error: 'No races found for this season' }, { status: 404 });
    }

    // Find the last completed race (status = 'final')
    const completedRaces = races.filter(r => r.status === 'final');
    const lastCompletedRace = completedRaces.length > 0
      ? completedRaces[completedRaces.length - 1]
      : null;

    // Find the next race that should be opened
    let nextRace = null;
    if (lastCompletedRace) {
      // Find the race with the next race_number after the last completed
      nextRace = races.find(r => r.race_number > lastCompletedRace.race_number && r.status !== 'final');
    } else {
      // No completed races yet, find the first non-final race
      nextRace = races.find(r => r.status !== 'final');
    }

    if (!nextRace) {
      return NextResponse.json({
        success: true,
        message: 'Season complete - no more races to advance to',
        seasonComplete: true,
      });
    }

    // Update the next race status to 'upcoming' (ready for picks)
    // The app uses 'upcoming' to indicate a race is open for picks
    const { error: updateError } = await supabase
      .from('races')
      .update({
        status: 'upcoming',
        updated_at: new Date().toISOString(),
      })
      .eq('id', nextRace.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Advanced to Race ${nextRace.race_number}: ${nextRace.name}`,
      previousRace: lastCompletedRace ? {
        race_number: lastCompletedRace.race_number,
        name: lastCompletedRace.name,
      } : null,
      nextRace: {
        id: nextRace.id,
        race_number: nextRace.race_number,
        name: nextRace.name,
        deadline: nextRace.deadline_datetime,
      },
    });
  } catch (err: any) {
    console.error('Error advancing race:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

// GET endpoint to check current race status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');

  if (!seasonId) {
    return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
  }

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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get race status summary
  const { data: races, error } = await supabase
    .from('races')
    .select('id, race_number, name, status')
    .eq('season_id', seasonId)
    .order('race_number', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const completedRaces = races?.filter(r => r.status === 'final') || [];
  const upcomingRaces = races?.filter(r => r.status === 'upcoming') || [];
  const currentRace = upcomingRaces.length > 0 ? upcomingRaces[0] : null;

  return NextResponse.json({
    totalRaces: races?.length || 0,
    completedRaces: completedRaces.length,
    currentRace: currentRace ? {
      id: currentRace.id,
      race_number: currentRace.race_number,
      name: currentRace.name,
    } : null,
    lastCompletedRace: completedRaces.length > 0 ? {
      race_number: completedRaces[completedRaces.length - 1].race_number,
      name: completedRaces[completedRaces.length - 1].name,
    } : null,
  });
}
