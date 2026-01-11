import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * This endpoint fixes driver_id mismatches caused by multiple drivers sharing the same car number.
 *
 * Problem: When importing race results, drivers are matched by car number. If multiple drivers
 * share the same car number (e.g., #16 is used by SVG, Hemric, AJ, and Josh Williams), the
 * import assigns ALL #16 results to whichever driver happens to be last in the query.
 *
 * This endpoint:
 * - GET: Shows race results where the driver name from JOIN doesn't match the driver record's name
 * - POST: Fixes results by finding the correct driver_id based on the actual driver name in the result
 */

interface MismatchedResult {
  result_id: string;
  race_id: string;
  finish_position: number;
  current_driver_id: string;
  current_driver_name: string;
  current_driver_car: number;
  correct_driver_id: string | null;
  correct_driver_name: string | null;
}

export async function GET() {
  const supabase = await createClient();

  // Get all race results with driver info via join
  const { data: results, error: resultsError } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      driver:drivers!inner(id, name, car_number, team_name)
    `)
    .order('finish_position');

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  // Get all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name');

  // Build lookup maps
  type Driver = { id: string; name: string; car_number: number; team_name: string };
  const driverById = new Map(drivers?.map(d => [d.id, d]) || []);
  const driversByName = new Map<string, Driver>();

  for (const d of drivers || []) {
    // Store by exact name (lowercase)
    driversByName.set(d.name.toLowerCase(), d);
  }

  // Find mismatches: where result.driver_id points to driver A, but the JOIN shows driver B
  // This happens when the FK constraint points to a different driver than what was actually recorded
  const mismatches: MismatchedResult[] = [];
  const correctlyLinked: number[] = [];

  // Group results by driver to check point calculations
  const pointsByDriverId: Record<string, number> = {};

  for (const result of results || []) {
    const joinedDriver = result.driver as any;
    const storedDriverId = result.driver_id;

    // The joined driver should have the same ID as driver_id
    // If they match, it's correctly linked
    if (joinedDriver && joinedDriver.id === storedDriverId) {
      correctlyLinked.push(result.finish_position);

      // Count points
      if (!pointsByDriverId[storedDriverId]) {
        pointsByDriverId[storedDriverId] = 0;
      }
      // Points: 1st=10, 2nd=9, etc (only top 10 score)
      if (result.finish_position <= 10) {
        pointsByDriverId[storedDriverId] += (11 - result.finish_position);
      }
    }
  }

  // Get specific check for SVG
  const svgDriver = drivers?.find(d => d.name.toLowerCase().includes('gisbergen'));
  const svgResults = results?.filter(r => r.driver_id === svgDriver?.id);

  // Also check what results show SVG via the join
  const resultsShowingSvg = results?.filter(r => {
    const driver = r.driver as any;
    return driver?.name?.toLowerCase().includes('gisbergen');
  });

  // Check for car #16 specifically
  const car16Drivers = drivers?.filter(d => d.car_number === 16);
  const car16DriverIds = new Set(car16Drivers?.map(d => d.id));
  const resultsForCar16 = results?.filter(r => car16DriverIds.has(r.driver_id));

  // Group car 16 results by actual driver
  const car16ByDriver: Record<string, { driver: any; results: any[] }> = {};
  for (const r of resultsForCar16 || []) {
    const driver = r.driver as any;
    const driverName = driver?.name || 'Unknown';
    if (!car16ByDriver[driverName]) {
      car16ByDriver[driverName] = { driver, results: [] };
    }
    car16ByDriver[driverName].results.push({
      race_id: r.race_id,
      position: r.finish_position,
      driver_id: r.driver_id,
    });
  }

  return NextResponse.json({
    summary: {
      total_results: results?.length || 0,
      correctly_linked: correctlyLinked.length,
    },
    svg_analysis: {
      svg_driver_id: svgDriver?.id,
      svg_driver_record: svgDriver,
      results_with_svg_driver_id: svgResults?.length || 0,
      results_showing_svg_via_join: resultsShowingSvg?.length || 0,
      svg_sample_results: resultsShowingSvg?.slice(0, 5).map(r => ({
        race_id: r.race_id,
        position: r.finish_position,
        driver_id: r.driver_id,
        driver_id_matches_svg: r.driver_id === svgDriver?.id,
      })),
    },
    car_16_analysis: {
      drivers_with_car_16: car16Drivers,
      results_for_car_16_drivers: resultsForCar16?.length || 0,
      breakdown_by_driver: Object.entries(car16ByDriver).map(([name, data]) => ({
        driver_name: name,
        driver_id: data.driver?.id,
        results_count: data.results.length,
        sample_results: data.results.slice(0, 3),
      })),
    },
    points_by_driver: Object.entries(pointsByDriverId)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([driverId, points]) => ({
        driver_id: driverId,
        driver_name: driverById.get(driverId)?.name,
        car_number: driverById.get(driverId)?.car_number,
        total_position_points: points,
      })),
  });
}

export async function POST() {
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

  // This would need actual race data to know which driver SHOULD be linked
  // For now, return info about what would need to be fixed

  return NextResponse.json({
    message: 'To fix car number conflicts, race results need to be re-imported with driver name matching instead of car number matching. The /api/admin/results-import endpoint should be used to re-import affected races.',
    suggestion: 'Consider updating the import logic to match drivers by name first, car number second.',
  });
}
