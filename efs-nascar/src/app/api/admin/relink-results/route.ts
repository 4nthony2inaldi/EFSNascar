import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Re-link race results to correct drivers using stored api_driver_name.
 *
 * This endpoint uses the original API driver name (stored when results were imported)
 * to re-match results to the correct driver records. This is useful when:
 * 1. Drivers have been deduplicated/merged
 * 2. Driver matching was incorrect during initial import
 * 3. Driver car numbers have changed
 *
 * GET: Preview what will be changed (dry run)
 * POST: Execute the re-linking
 */

// Helper to normalize names for matching
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Remove non-alpha characters
    .replace(/\s+/g, ' ')     // Normalize spaces
    .trim();
}

// Helper to get last name
function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

interface RelinkResult {
  result_id: string;
  race_id: string;
  api_driver_name: string;
  api_car_number: number | null;
  current_driver: { id: string; name: string; car_number: number } | null;
  new_driver: { id: string; name: string; car_number: number } | null;
  action: 'keep' | 'update' | 'no_match';
  reason: string;
}

export async function GET() {
  const supabase = await createClient();

  // Get all race results with api_driver_name
  const { data: results, error: resultsError } = await supabase
    .from('race_results')
    .select('id, race_id, driver_id, api_driver_name, api_car_number, finish_position');

  if (resultsError || !results) {
    return NextResponse.json({ error: 'Failed to fetch race results' }, { status: 500 });
  }

  // Get all drivers
  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  if (driversError || !drivers) {
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }

  // Build driver lookup maps
  const driverById = new Map(drivers.map(d => [d.id, d]));
  const driverByExactName = new Map(drivers.map(d => [d.name.toLowerCase(), d]));
  const driverByNormalizedName = new Map(drivers.map(d => [normalizeName(d.name), d]));
  const driverByLastName = new Map<string, typeof drivers[0][]>();

  for (const d of drivers) {
    const lastName = getLastName(d.name);
    if (!driverByLastName.has(lastName)) {
      driverByLastName.set(lastName, []);
    }
    driverByLastName.get(lastName)!.push(d);
  }

  // Function to find best driver match by name
  const findDriverByName = (apiName: string, carNumber: number | null): typeof drivers[0] | null => {
    // 1. Try exact name match
    const exactMatch = driverByExactName.get(apiName.toLowerCase());
    if (exactMatch) return exactMatch;

    // 2. Try normalized name match
    const normalizedMatch = driverByNormalizedName.get(normalizeName(apiName));
    if (normalizedMatch) return normalizedMatch;

    // 3. Try last name match (if unique)
    const lastName = getLastName(apiName);
    const lastNameMatches = driverByLastName.get(lastName);
    if (lastNameMatches && lastNameMatches.length === 1) {
      return lastNameMatches[0];
    }

    // 4. Try last name + car number combo
    if (lastNameMatches && lastNameMatches.length > 1 && carNumber) {
      const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
      if (carMatch) return carMatch;
    }

    return null;
  };

  // Analyze each result
  const relinkResults: RelinkResult[] = [];
  let keepCount = 0;
  let updateCount = 0;
  let noMatchCount = 0;
  let noApiNameCount = 0;

  for (const result of results) {
    const currentDriver = driverById.get(result.driver_id) || null;

    // Skip results without api_driver_name
    if (!result.api_driver_name) {
      noApiNameCount++;
      continue;
    }

    const matchedDriver = findDriverByName(result.api_driver_name, result.api_car_number);

    if (!matchedDriver) {
      noMatchCount++;
      relinkResults.push({
        result_id: result.id,
        race_id: result.race_id,
        api_driver_name: result.api_driver_name,
        api_car_number: result.api_car_number,
        current_driver: currentDriver,
        new_driver: null,
        action: 'no_match',
        reason: `No driver found matching "${result.api_driver_name}"`,
      });
      continue;
    }

    if (matchedDriver.id === result.driver_id) {
      keepCount++;
      // Don't add to results - already correct
      continue;
    }

    // Driver mismatch found
    updateCount++;
    relinkResults.push({
      result_id: result.id,
      race_id: result.race_id,
      api_driver_name: result.api_driver_name,
      api_car_number: result.api_car_number,
      current_driver: currentDriver,
      new_driver: matchedDriver,
      action: 'update',
      reason: `Currently linked to "${currentDriver?.name}" but API name "${result.api_driver_name}" matches "${matchedDriver.name}"`,
    });
  }

  return NextResponse.json({
    summary: {
      total_results: results.length,
      results_with_api_name: results.length - noApiNameCount,
      results_without_api_name: noApiNameCount,
      already_correct: keepCount,
      needs_update: updateCount,
      no_driver_match: noMatchCount,
    },
    changes: relinkResults.filter(r => r.action === 'update'),
    unmatched: relinkResults.filter(r => r.action === 'no_match'),
    instructions: updateCount > 0
      ? 'POST to this endpoint to apply the re-linking'
      : 'No changes needed - all results are correctly linked',
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

  // Get all race results with api_driver_name
  const { data: results } = await supabase
    .from('race_results')
    .select('id, race_id, driver_id, api_driver_name, api_car_number');

  // Get all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number');

  if (!results || !drivers) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }

  // Build driver lookup maps
  const driverByExactName = new Map(drivers.map(d => [d.name.toLowerCase(), d]));
  const driverByNormalizedName = new Map(drivers.map(d => [normalizeName(d.name), d]));
  const driverByLastName = new Map<string, typeof drivers[0][]>();

  for (const d of drivers) {
    const lastName = getLastName(d.name);
    if (!driverByLastName.has(lastName)) {
      driverByLastName.set(lastName, []);
    }
    driverByLastName.get(lastName)!.push(d);
  }

  const findDriverByName = (apiName: string, carNumber: number | null): typeof drivers[0] | null => {
    const exactMatch = driverByExactName.get(apiName.toLowerCase());
    if (exactMatch) return exactMatch;

    const normalizedMatch = driverByNormalizedName.get(normalizeName(apiName));
    if (normalizedMatch) return normalizedMatch;

    const lastName = getLastName(apiName);
    const lastNameMatches = driverByLastName.get(lastName);
    if (lastNameMatches && lastNameMatches.length === 1) {
      return lastNameMatches[0];
    }

    if (lastNameMatches && lastNameMatches.length > 1 && carNumber) {
      const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
      if (carMatch) return carMatch;
    }

    return null;
  };

  // Apply updates
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const updates: Array<{
    result_id: string;
    old_driver: string;
    new_driver: string;
    api_name: string;
  }> = [];

  for (const result of results) {
    if (!result.api_driver_name) {
      skippedCount++;
      continue;
    }

    const matchedDriver = findDriverByName(result.api_driver_name, result.api_car_number);

    if (!matchedDriver || matchedDriver.id === result.driver_id) {
      skippedCount++;
      continue;
    }

    // Update the result
    const { error } = await supabase
      .from('race_results')
      .update({ driver_id: matchedDriver.id })
      .eq('id', result.id);

    if (error) {
      errors.push(`Failed to update result ${result.id}: ${error.message}`);
    } else {
      updatedCount++;
      const oldDriver = drivers.find(d => d.id === result.driver_id);
      updates.push({
        result_id: result.id,
        old_driver: oldDriver ? `${oldDriver.name} (#${oldDriver.car_number})` : result.driver_id,
        new_driver: `${matchedDriver.name} (#${matchedDriver.car_number})`,
        api_name: result.api_driver_name,
      });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    summary: {
      total_processed: results.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errors.length,
    },
    updates,
    errors: errors.length > 0 ? errors : undefined,
  });
}
