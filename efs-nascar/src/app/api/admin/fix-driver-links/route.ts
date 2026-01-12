import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * This endpoint diagnoses and fixes orphaned driver_id references in race_results.
 *
 * The problem: race_results may have driver_ids that don't exist in the drivers table,
 * causing the driver rankings page to skip those results (showing 0 points for drivers
 * who actually have results).
 *
 * GET: Diagnose the problem (show mismatched records)
 * POST: Fix the problem (update driver_ids to match correct drivers)
 */

export async function GET() {
  const supabase = await createClient();

  // Get all unique driver_ids from race_results
  const { data: allResults } = await supabase
    .from('race_results')
    .select('driver_id, race_id, finish_position');

  // Get all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name');

  const driverIdSet = new Set(drivers?.map(d => d.id) || []);
  const driverByName = new Map(drivers?.map(d => [d.name.toLowerCase(), d]) || []);
  const driverByCarNumber = new Map(drivers?.map(d => [d.car_number, d]) || []);

  // Find orphaned driver_ids (in race_results but not in drivers table)
  const orphanedDriverIds = new Set<string>();
  const validDriverIds = new Set<string>();

  for (const result of allResults || []) {
    if (driverIdSet.has(result.driver_id)) {
      validDriverIds.add(result.driver_id);
    } else {
      orphanedDriverIds.add(result.driver_id);
    }
  }

  // For each orphaned ID, try to find the driver using the JOIN and suggest a fix
  const orphanedDetails: Array<{
    orphaned_driver_id: string;
    results_count: number;
    sample_result: any;
    joined_driver_info: any;
    suggested_fix_driver_id: string | null;
  }> = [];

  for (const orphanedId of orphanedDriverIds) {
    // Get results with this orphaned ID, using JOIN to see what driver data exists
    const { data: resultsWithJoin } = await supabase
      .from('race_results')
      .select('*, driver:drivers(id, name, car_number, team_name)')
      .eq('driver_id', orphanedId)
      .limit(3);

    const resultCount = allResults?.filter(r => r.driver_id === orphanedId).length || 0;

    // The join might return null driver if truly orphaned, or might return data
    // if there's something weird with the relationship
    const joinedDriver = resultsWithJoin?.[0]?.driver;

    // Try to find a matching driver by name or car number from the joined data
    let suggestedFixId: string | null = null;
    if (joinedDriver?.name) {
      const matchByName = driverByName.get(joinedDriver.name.toLowerCase());
      if (matchByName) {
        suggestedFixId = matchByName.id;
      }
    }
    if (!suggestedFixId && joinedDriver?.car_number) {
      const matchByCarNum = driverByCarNumber.get(joinedDriver.car_number);
      if (matchByCarNum) {
        suggestedFixId = matchByCarNum.id;
      }
    }

    orphanedDetails.push({
      orphaned_driver_id: orphanedId,
      results_count: resultCount,
      sample_result: resultsWithJoin?.[0] ? {
        race_id: resultsWithJoin[0].race_id,
        finish_position: resultsWithJoin[0].finish_position,
      } : null,
      joined_driver_info: joinedDriver,
      suggested_fix_driver_id: suggestedFixId,
    });
  }

  // Also check for potential duplicate drivers (same name or car number)
  const duplicatesByName: Record<string, any[]> = {};
  const duplicatesByCarNumber: Record<number, any[]> = {};

  for (const driver of drivers || []) {
    const nameLower = driver.name.toLowerCase();
    if (!duplicatesByName[nameLower]) {
      duplicatesByName[nameLower] = [];
    }
    duplicatesByName[nameLower].push(driver);

    if (!duplicatesByCarNumber[driver.car_number]) {
      duplicatesByCarNumber[driver.car_number] = [];
    }
    duplicatesByCarNumber[driver.car_number].push(driver);
  }

  const actualDuplicateNames = Object.entries(duplicatesByName)
    .filter(([, arr]) => arr.length > 1)
    .map(([name, arr]) => ({ name, drivers: arr }));

  const actualDuplicateCarNumbers = Object.entries(duplicatesByCarNumber)
    .filter(([, arr]) => arr.length > 1)
    .map(([carNum, arr]) => ({ car_number: parseInt(carNum), drivers: arr }));

  return NextResponse.json({
    summary: {
      total_results: allResults?.length || 0,
      total_drivers: drivers?.length || 0,
      valid_driver_ids_in_results: validDriverIds.size,
      orphaned_driver_ids_count: orphanedDriverIds.size,
      fixable_orphans: orphanedDetails.filter(o => o.suggested_fix_driver_id).length,
    },
    orphaned_details: orphanedDetails,
    duplicate_drivers: {
      by_name: actualDuplicateNames,
      by_car_number: actualDuplicateCarNumbers,
    },
    instructions: orphanedDriverIds.size > 0
      ? 'POST to this endpoint to apply fixes for orphaned driver_ids'
      : 'No orphaned driver_ids found - data looks healthy!',
  });
}

export async function POST() {
  const supabase = await createClient();

  // Get all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  const driverIdSet = new Set(drivers?.map(d => d.id) || []);
  const driverByName = new Map(drivers?.map(d => [d.name.toLowerCase(), d]) || []);
  const driverByCarNumber = new Map(drivers?.map(d => [d.car_number, d]) || []);

  // Get all race_results
  const { data: allResults } = await supabase
    .from('race_results')
    .select('id, driver_id');

  // Find orphaned records and their fixes
  const fixes: Array<{
    result_id: string;
    old_driver_id: string;
    new_driver_id: string;
    matched_by: string;
  }> = [];

  const unfixable: string[] = [];

  for (const result of allResults || []) {
    if (driverIdSet.has(result.driver_id)) {
      continue; // Already valid
    }

    // Try to get driver info via join
    const { data: resultWithDriver } = await supabase
      .from('race_results')
      .select('*, driver:drivers(id, name, car_number)')
      .eq('id', result.id)
      .single();

    const joinedDriver = resultWithDriver?.driver;

    let newDriverId: string | null = null;
    let matchedBy = '';

    // Try to match by name
    if (joinedDriver?.name) {
      const match = driverByName.get(joinedDriver.name.toLowerCase());
      if (match) {
        newDriverId = match.id;
        matchedBy = `name: ${joinedDriver.name}`;
      }
    }

    // Try to match by car number if name didn't work
    if (!newDriverId && joinedDriver?.car_number) {
      const match = driverByCarNumber.get(joinedDriver.car_number);
      if (match) {
        newDriverId = match.id;
        matchedBy = `car_number: ${joinedDriver.car_number}`;
      }
    }

    if (newDriverId) {
      fixes.push({
        result_id: result.id,
        old_driver_id: result.driver_id,
        new_driver_id: newDriverId,
        matched_by: matchedBy,
      });
    } else {
      unfixable.push(result.id);
    }
  }

  // Apply fixes
  let fixedCount = 0;
  const errors: string[] = [];

  for (const fix of fixes) {
    const { error } = await supabase
      .from('race_results')
      .update({ driver_id: fix.new_driver_id })
      .eq('id', fix.result_id);

    if (error) {
      errors.push(`Failed to fix result ${fix.result_id}: ${error.message}`);
    } else {
      fixedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      total_orphaned: fixes.length + unfixable.length,
      fixed: fixedCount,
      unfixable: unfixable.length,
      errors: errors.length,
    },
    fixes_applied: fixes,
    unfixable_result_ids: unfixable,
    errors: errors.length > 0 ? errors : undefined,
  });
}
