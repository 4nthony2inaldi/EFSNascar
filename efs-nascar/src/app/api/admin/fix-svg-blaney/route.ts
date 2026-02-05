import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Quick fix specifically for SVG and Blaney driver linking issues.
 * Much faster than relink-all-results since it only targets these two drivers.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const fixes: string[] = [];

    // Step 1: Find SVG and Blaney driver records
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, car_number')
      .or('name.ilike.%gisbergen%,name.ilike.%blaney%');

    if (!drivers || drivers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not find SVG or Blaney in drivers table'
      }, { status: 404 });
    }

    const svg = drivers.find(d => d.name.toLowerCase().includes('gisbergen'));
    const blaney = drivers.find(d => d.name.toLowerCase().includes('blaney'));

    fixes.push(`Found SVG: ${svg?.name} (#${svg?.car_number}, id: ${svg?.id})`);
    fixes.push(`Found Blaney: ${blaney?.name} (#${blaney?.car_number}, id: ${blaney?.id})`);

    // Step 2: Get all race results that have api_driver_name matching these drivers
    // but might be linked to wrong driver_id
    const { data: allResults, error: resultsError } = await supabase
      .from('race_results')
      .select('id, driver_id, api_driver_name, finish_position')
      .or('api_driver_name.ilike.%gisbergen%,api_driver_name.ilike.%blaney%');

    if (resultsError) {
      return NextResponse.json({
        success: false,
        error: 'Error fetching results',
        details: resultsError.message
      }, { status: 500 });
    }

    fixes.push(`Found ${allResults?.length || 0} results with SVG/Blaney api_driver_name`);

    let svgFixed = 0;
    let blaneyFixed = 0;

    // Step 3: Fix any results that have wrong driver_id
    for (const result of allResults || []) {
      const apiName = (result.api_driver_name || '').toLowerCase();

      if (apiName.includes('gisbergen') && svg && result.driver_id !== svg.id) {
        const { error } = await supabase
          .from('race_results')
          .update({ driver_id: svg.id })
          .eq('id', result.id);

        if (!error) svgFixed++;
      }

      if (apiName.includes('blaney') && blaney && result.driver_id !== blaney.id) {
        const { error } = await supabase
          .from('race_results')
          .update({ driver_id: blaney.id })
          .eq('id', result.id);

        if (!error) blaneyFixed++;
      }
    }

    fixes.push(`Fixed ${svgFixed} SVG results`);
    fixes.push(`Fixed ${blaneyFixed} Blaney results`);

    // Step 4: Also check for results WITHOUT api_driver_name that might need fixing
    // by looking at finish positions that match known wins
    const { data: svgWinResults } = await supabase
      .from('race_results')
      .select('id, race_id, driver_id, finish_position')
      .eq('finish_position', 1)
      .neq('driver_id', svg?.id || '');

    // Count current state
    const { count: svgResultCount } = await supabase
      .from('race_results')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', svg?.id || '');

    const { count: blaneyResultCount } = await supabase
      .from('race_results')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', blaney?.id || '');

    const { count: svgWins } = await supabase
      .from('race_results')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', svg?.id || '')
      .eq('finish_position', 1);

    const { count: blaneyWins } = await supabase
      .from('race_results')
      .select('*', { count: 'exact', head: true })
      .eq('driver_id', blaney?.id || '')
      .eq('finish_position', 1);

    return NextResponse.json({
      success: true,
      fixes,
      summary: {
        svg_results_fixed: svgFixed,
        blaney_results_fixed: blaneyFixed,
        total_fixed: svgFixed + blaneyFixed,
      },
      current_state: {
        svg: {
          name: svg?.name,
          car_number: svg?.car_number,
          total_results: svgResultCount,
          wins: svgWins,
        },
        blaney: {
          name: blaney?.name,
          car_number: blaney?.car_number,
          total_results: blaneyResultCount,
          wins: blaneyWins,
        },
      },
    });
  } catch (error) {
    console.error('Fix SVG/Blaney error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
