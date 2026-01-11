import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: seasons, error } = await supabase
      .from('seasons')
      .select('id, name, year, is_active')
      .order('year', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ seasons });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
