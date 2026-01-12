import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { POSITION_POINTS } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Comprehensive debug endpoint to diagnose SVG and Blaney data issues.
 * Shows all relevant database state and compares to expected values.
 */

export async function GET() {
  const supabase = await createClient();

  // Step 1: Find both drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .or('name.ilike.%gisbergen%,name.ilike.%blaney%');

  const svg = drivers?.find(d => d.name.toLowerCase().includes('gisbergen'));
  const blaney = drivers?.find(d => d.name.toLowerCase().includes('blaney'));

  // Step 2: Get ALL race results for both drivers
  const driverIds = [svg?.id, blaney?.id].filter(Boolean);

  const { data: allResults } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      stage_1_winner,
      stage_2_winner,
      most_laps_led,
      api_driver_name,
      api_car_number
    `)
    .in('driver_id', driverIds);

  // Step 3: Get races for context
  const raceIds = [...new Set(allResults?.map(r => r.race_id) || [])];
  const { data: races } = await supabase
    .from('races')
    .select('id, name, track, race_number, status, scheduled_datetime, season_id')
    .in('id', raceIds);

  const raceMap = new Map(races?.map(r => [r.id, r]) || []);

  // Step 4: Get results with api_driver_name matching SVG/Blaney (might be linked to wrong driver_id)
  const { data: apiNameResults } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      api_driver_name,
      api_car_number
    `)
    .or('api_driver_name.ilike.%gisbergen%,api_driver_name.ilike.%blaney%');

  // Step 5: Get all P1 finishes to see who has wins
  const { data: allWins } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      api_driver_name,
      api_car_number
    `)
    .eq('finish_position', 1);

  // Get driver names for P1 finishes
  const winDriverIds = [...new Set(allWins?.map(w => w.driver_id) || [])];
  const { data: winDrivers } = await supabase
    .from('drivers')
    .select('id, name, car_number')
    .in('id', winDriverIds);

  const driverMap = new Map(winDrivers?.map(d => [d.id, d]) || []);

  // Analyze SVG results
  const svgResults = allResults?.filter(r => r.driver_id === svg?.id) || [];
  const svgWins = svgResults.filter(r => r.finish_position === 1);
  let svgPoints = 0;
  for (const r of svgResults) {
    svgPoints += POSITION_POINTS[r.finish_position] || 0;
    if (r.stage_1_winner) svgPoints += 1;
    if (r.stage_2_winner) svgPoints += 1;
    if (r.most_laps_led) svgPoints += 1;
  }

  // Analyze Blaney results
  const blaneyResults = allResults?.filter(r => r.driver_id === blaney?.id) || [];
  const blaneyWins = blaneyResults.filter(r => r.finish_position === 1);
  let blaneyPoints = 0;
  for (const r of blaneyResults) {
    blaneyPoints += POSITION_POINTS[r.finish_position] || 0;
    if (r.stage_1_winner) blaneyPoints += 1;
    if (r.stage_2_winner) blaneyPoints += 1;
    if (r.most_laps_led) blaneyPoints += 1;
  }

  // Find results with api_driver_name but wrong driver_id
  const wronglinkSvg = apiNameResults?.filter(
    r => r.api_driver_name?.toLowerCase().includes('gisbergen') && r.driver_id !== svg?.id
  ) || [];
  const wrongLinkBlaney = apiNameResults?.filter(
    r => r.api_driver_name?.toLowerCase().includes('blaney') && r.driver_id !== blaney?.id
  ) || [];

  // Find wins that might belong to SVG/Blaney based on api_driver_name
  const svgWinsInDb = allWins?.filter(
    w => w.api_driver_name?.toLowerCase().includes('gisbergen')
  ) || [];
  const blaneyWinsInDb = allWins?.filter(
    w => w.api_driver_name?.toLowerCase().includes('blaney')
  ) || [];

  // Check for NULL api_driver_names
  const svgResultsWithoutApiName = svgResults.filter(r => !r.api_driver_name);
  const blaneyResultsWithoutApiName = blaneyResults.filter(r => !r.api_driver_name);

  return NextResponse.json({
    drivers: {
      svg: svg ? {
        id: svg.id,
        name: svg.name,
        car_number: svg.car_number,
        is_active: svg.is_active,
      } : null,
      blaney: blaney ? {
        id: blaney.id,
        name: blaney.name,
        car_number: blaney.car_number,
        is_active: blaney.is_active,
      } : null,
    },

    svg_analysis: {
      total_results: svgResults.length,
      total_points: svgPoints,
      wins: svgWins.length,
      wins_detail: svgWins.map(w => ({
        race_id: w.race_id,
        race_name: raceMap.get(w.race_id)?.name,
        api_driver_name: w.api_driver_name,
      })),
      results_without_api_name: svgResultsWithoutApiName.length,
      wrongly_linked_results: wronglinkSvg.length,
      wrongly_linked_sample: wronglinkSvg.slice(0, 5).map(r => ({
        id: r.id,
        finish_position: r.finish_position,
        api_driver_name: r.api_driver_name,
        current_driver_id: r.driver_id,
      })),
      wins_by_api_name: {
        count: svgWinsInDb.length,
        sample: svgWinsInDb.slice(0, 5).map(w => ({
          id: w.id,
          driver_id: w.driver_id,
          driver_name: driverMap.get(w.driver_id)?.name,
          api_driver_name: w.api_driver_name,
        })),
      },
    },

    blaney_analysis: {
      total_results: blaneyResults.length,
      total_points: blaneyPoints,
      wins: blaneyWins.length,
      wins_detail: blaneyWins.map(w => ({
        race_id: w.race_id,
        race_name: raceMap.get(w.race_id)?.name,
        api_driver_name: w.api_driver_name,
      })),
      results_without_api_name: blaneyResultsWithoutApiName.length,
      wrongly_linked_results: wrongLinkBlaney.length,
      wrongly_linked_sample: wrongLinkBlaney.slice(0, 5).map(r => ({
        id: r.id,
        finish_position: r.finish_position,
        api_driver_name: r.api_driver_name,
        current_driver_id: r.driver_id,
      })),
      wins_by_api_name: {
        count: blaneyWinsInDb.length,
        sample: blaneyWinsInDb.slice(0, 5).map(w => ({
          id: w.id,
          driver_id: w.driver_id,
          driver_name: driverMap.get(w.driver_id)?.name,
          api_driver_name: w.api_driver_name,
        })),
      },
    },

    data_quality: {
      total_api_name_matches: apiNameResults?.length || 0,
      svg_api_name_matches: apiNameResults?.filter(r => r.api_driver_name?.toLowerCase().includes('gisbergen')).length || 0,
      blaney_api_name_matches: apiNameResults?.filter(r => r.api_driver_name?.toLowerCase().includes('blaney')).length || 0,
      total_wins_in_db: allWins?.length || 0,
    },

    diagnosis: {
      svg_issue: svgWins.length === 0 && svgWinsInDb.length > 0
        ? `SVG has ${svgWinsInDb.length} wins by api_driver_name but they're linked to wrong driver_id`
        : svgWins.length === 0 && svgResults.length === 0
        ? 'SVG has no race results linked at all'
        : svgWins.length === 0
        ? 'SVG has results but no wins - api_driver_name may not be populated'
        : `SVG has ${svgWins.length} wins correctly linked`,
      blaney_issue: blaneyWins.length === 0 && blaneyWinsInDb.length > 0
        ? `Blaney has ${blaneyWinsInDb.length} wins by api_driver_name but they're linked to wrong driver_id`
        : blaneyWins.length === 0 && blaneyResults.length === 0
        ? 'Blaney has no race results linked at all'
        : blaneyWins.length === 0
        ? 'Blaney has results but no wins - api_driver_name may not be populated'
        : `Blaney has ${blaneyWins.length} wins correctly linked`,
    },
  });
}
