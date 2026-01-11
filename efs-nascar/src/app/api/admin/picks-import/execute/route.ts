import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface MatchedRow {
  original: {
    week: number;
    race: string;
    team: string;
    driver1: string;
    driver2: string;
    driver3: string;
  };
  raceMatch: { id: string; name: string; race_number: number } | null;
  teamMatch: { id: string; name: string } | null;
  driver1Match: { id: string; name: string } | null;
  driver2Match: { id: string; name: string } | null;
  driver3Match: { id: string; name: string } | null;
  isValid: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { picks, seasonId } = await request.json();

    if (!picks || !Array.isArray(picks) || picks.length === 0) {
      return NextResponse.json({ error: 'No valid picks to import' }, { status: 400 });
    }

    const supabase = await createClient();

    let success = 0;
    let failed = 0;

    for (const pick of picks as MatchedRow[]) {
      if (!pick.isValid || !pick.raceMatch || !pick.teamMatch || !pick.driver1Match || !pick.driver2Match || !pick.driver3Match) {
        failed++;
        continue;
      }

      try {
        // Check if pick already exists for this team/race
        const { data: existing } = await supabase
          .from('picks')
          .select('id')
          .eq('race_id', pick.raceMatch.id)
          .eq('team_id', pick.teamMatch.id)
          .single();

        if (existing) {
          // Update existing pick
          const { error } = await supabase
            .from('picks')
            .update({
              driver1_id: pick.driver1Match.id,
              driver2_id: pick.driver2Match.id,
              driver3_id: pick.driver3Match.id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (error) {
            console.error('Failed to update pick:', error);
            failed++;
          } else {
            success++;
          }
        } else {
          // Insert new pick
          const { error } = await supabase
            .from('picks')
            .insert({
              race_id: pick.raceMatch.id,
              team_id: pick.teamMatch.id,
              driver1_id: pick.driver1Match.id,
              driver2_id: pick.driver2Match.id,
              driver3_id: pick.driver3Match.id,
            });

          if (error) {
            console.error('Failed to insert pick:', error);
            failed++;
          } else {
            success++;
          }
        }
      } catch (err) {
        console.error('Error processing pick:', err);
        failed++;
      }
    }

    return NextResponse.json({ success, failed });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
