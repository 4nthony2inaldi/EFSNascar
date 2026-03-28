import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');

    if (!seasonId) {
      return NextResponse.json({ error: 'Season ID required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const regularClient = await createClient();
    const supabase = adminClient || regularClient;

    // Verify commissioner access
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

    // Get season info
    const { data: season } = await supabase
      .from('seasons')
      .select('id, year, name')
      .eq('id', seasonId)
      .single();

    if (!season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    }

    // Get all races for this season
    const { data: races } = await supabase
      .from('races')
      .select('id, race_number, name, track')
      .eq('season_id', seasonId)
      .order('race_number', { ascending: true });

    const raceMap = new Map<string, { race_number: number; name: string; track: string }>();
    for (const race of races || []) {
      raceMap.set(race.id, { race_number: race.race_number, name: race.name, track: race.track });
    }

    // Get all picks for this season's races
    const raceIds = (races || []).map(r => r.id);

    if (raceIds.length === 0) {
      return NextResponse.json({ error: 'No races found for this season' }, { status: 404 });
    }

    const { data: picks } = await supabase
      .from('picks')
      .select('id, race_id, team_id, driver_1_id, driver_2_id, driver_3_id')
      .in('race_id', raceIds);

    // Get teams and drivers for lookup
    const { data: teams } = await supabase.from('teams').select('id, name');
    const { data: drivers } = await supabase.from('drivers').select('id, name');

    const teamMap = new Map<string, string>();
    for (const team of teams || []) {
      teamMap.set(team.id, team.name);
    }

    const driverMap = new Map<string, string>();
    for (const driver of drivers || []) {
      driverMap.set(driver.id, driver.name);
    }

    // Build CSV rows
    const csvRows: string[] = [];

    // Header row
    csvRows.push('Week,Race,Team,Driver 1,Driver 2,Driver 3');

    // Sort picks by race number, then by team name
    const sortedPicks = (picks || []).sort((a, b) => {
      const raceA = raceMap.get(a.race_id);
      const raceB = raceMap.get(b.race_id);
      const raceNumDiff = (raceA?.race_number || 0) - (raceB?.race_number || 0);
      if (raceNumDiff !== 0) return raceNumDiff;

      const teamA = teamMap.get(a.team_id) || '';
      const teamB = teamMap.get(b.team_id) || '';
      return teamA.localeCompare(teamB);
    });

    for (const pick of sortedPicks) {
      const race = raceMap.get(pick.race_id);
      const teamName = teamMap.get(pick.team_id) || 'Unknown';
      const driver1Name = driverMap.get(pick.driver_1_id) || 'Unknown';
      const driver2Name = driverMap.get(pick.driver_2_id) || 'Unknown';
      const driver3Name = driverMap.get(pick.driver_3_id) || 'Unknown';

      // Escape fields that might contain commas
      const escapeField = (field: string) => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      };

      csvRows.push([
        race?.race_number || 0,
        escapeField(race?.name || 'Unknown'),
        escapeField(teamName),
        escapeField(driver1Name),
        escapeField(driver2Name),
        escapeField(driver3Name),
      ].join(','));
    }

    const csvContent = csvRows.join('\n');

    // Return as downloadable CSV file
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="picks-${season.year}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
