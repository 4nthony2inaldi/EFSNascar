import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * This endpoint fixes race_results where the driver_id doesn't match
 * the correct driver based on name matching.
 *
 * The problem: Multiple drivers share car numbers (e.g., #16 has SVG, Hemric, AJ, Josh Williams).
 * When importing, results were matched by car number, assigning wins to the wrong driver.
 *
 * This fix:
 * 1. Gets all race results with current driver info
 * 2. For each result, finds the correct driver by matching names in our database
 * 3. If there's a mismatch, updates the driver_id
 *
 * GET: Preview what would be fixed
 * POST: Apply the fixes
 */

// Helper to normalize names for matching
const normalizeName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Helper to get last name
const getLastName = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
};

export async function GET() {
  const supabase = await createClient();

  // Get all race results with driver info
  const { data: results, error: resultsError } = await supabase
    .from('race_results')
    .select(`
      id,
      race_id,
      driver_id,
      finish_position,
      driver:drivers(id, name, car_number, team_name)
    `);

  if (resultsError) {
    return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  // Get all drivers for name matching
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name, is_active');

  // Build name lookup maps
  const driverByExactName = new Map<string, typeof drivers[0]>();
  const driverByNormalizedName = new Map<string, typeof drivers[0]>();
  const driverByLastName = new Map<string, typeof drivers[0][]>();

  for (const d of drivers || []) {
    driverByExactName.set(d.name.toLowerCase(), d);
    driverByNormalizedName.set(normalizeName(d.name), d);

    const lastName = getLastName(d.name);
    if (!driverByLastName.has(lastName)) {
      driverByLastName.set(lastName, []);
    }
    driverByLastName.get(lastName)!.push(d);
  }

  // Function to find best matching driver by name
  const findDriverByName = (name: string, carNumber: number): typeof drivers[0] | null => {
    // 1. Exact name match
    const exact = driverByExactName.get(name.toLowerCase());
    if (exact) return exact;

    // 2. Normalized name match
    const normalized = driverByNormalizedName.get(normalizeName(name));
    if (normalized) return normalized;

    // 3. Last name match (if unique)
    const lastName = getLastName(name);
    const lastNameMatches = driverByLastName.get(lastName);
    if (lastNameMatches?.length === 1) {
      return lastNameMatches[0];
    }

    // 4. Last name + car number combo
    if (lastNameMatches && lastNameMatches.length > 1) {
      const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
      if (carMatch) return carMatch;
    }

    return null;
  };

  // Find mismatches
  const mismatches: Array<{
    result_id: string;
    race_id: string;
    finish_position: number;
    current_driver_id: string;
    current_driver_name: string;
    current_car_number: number;
    correct_driver_id: string;
    correct_driver_name: string;
  }> = [];

  const alreadyCorrect: number[] = [];
  const noMatchFound: Array<{ result_id: string; driver_name: string; car_number: number }> = [];

  for (const result of results || []) {
    const currentDriver = result.driver as any;
    if (!currentDriver) continue;

    // Try to find the correct driver by name
    const correctDriver = findDriverByName(currentDriver.name, currentDriver.car_number);

    if (!correctDriver) {
      noMatchFound.push({
        result_id: result.id,
        driver_name: currentDriver.name,
        car_number: currentDriver.car_number,
      });
      continue;
    }

    if (correctDriver.id === result.driver_id) {
      alreadyCorrect.push(result.finish_position);
    } else {
      mismatches.push({
        result_id: result.id,
        race_id: result.race_id,
        finish_position: result.finish_position,
        current_driver_id: result.driver_id,
        current_driver_name: currentDriver.name,
        current_car_number: currentDriver.car_number,
        correct_driver_id: correctDriver.id,
        correct_driver_name: correctDriver.name,
      });
    }
  }

  // Group mismatches by driver name for summary
  const mismatchSummary: Record<string, { count: number; sample_positions: number[] }> = {};
  for (const m of mismatches) {
    if (!mismatchSummary[m.current_driver_name]) {
      mismatchSummary[m.current_driver_name] = { count: 0, sample_positions: [] };
    }
    mismatchSummary[m.current_driver_name].count++;
    if (mismatchSummary[m.current_driver_name].sample_positions.length < 5) {
      mismatchSummary[m.current_driver_name].sample_positions.push(m.finish_position);
    }
  }

  return NextResponse.json({
    summary: {
      total_results: results?.length || 0,
      already_correct: alreadyCorrect.length,
      mismatches_found: mismatches.length,
      no_match_found: noMatchFound.length,
    },
    mismatch_summary: mismatchSummary,
    sample_mismatches: mismatches.slice(0, 20),
    no_match_found: noMatchFound.slice(0, 10),
    instructions: mismatches.length > 0
      ? 'POST to this endpoint to apply fixes'
      : 'No mismatches found - all results appear correctly linked',
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

  // Get all race results with driver info
  const { data: results } = await supabase
    .from('race_results')
    .select(`
      id,
      driver_id,
      driver:drivers(id, name, car_number)
    `);

  // Get all drivers for name matching
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, name, car_number, is_active');

  // Build name lookup maps
  const driverByExactName = new Map<string, typeof drivers[0]>();
  const driverByNormalizedName = new Map<string, typeof drivers[0]>();
  const driverByLastName = new Map<string, typeof drivers[0][]>();

  for (const d of drivers || []) {
    driverByExactName.set(d.name.toLowerCase(), d);
    driverByNormalizedName.set(normalizeName(d.name), d);

    const lastName = getLastName(d.name);
    if (!driverByLastName.has(lastName)) {
      driverByLastName.set(lastName, []);
    }
    driverByLastName.get(lastName)!.push(d);
  }

  const findDriverByName = (name: string, carNumber: number): typeof drivers[0] | null => {
    const exact = driverByExactName.get(name.toLowerCase());
    if (exact) return exact;

    const normalized = driverByNormalizedName.get(normalizeName(name));
    if (normalized) return normalized;

    const lastName = getLastName(name);
    const lastNameMatches = driverByLastName.get(lastName);
    if (lastNameMatches?.length === 1) return lastNameMatches[0];
    if (lastNameMatches && lastNameMatches.length > 1) {
      const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
      if (carMatch) return carMatch;
    }

    return null;
  };

  // Find and fix mismatches
  let fixedCount = 0;
  const errors: string[] = [];

  for (const result of results || []) {
    const currentDriver = result.driver as any;
    if (!currentDriver) continue;

    const correctDriver = findDriverByName(currentDriver.name, currentDriver.car_number);
    if (!correctDriver || correctDriver.id === result.driver_id) continue;

    // Update the driver_id
    const { error } = await supabase
      .from('race_results')
      .update({ driver_id: correctDriver.id })
      .eq('id', result.id);

    if (error) {
      errors.push(`Failed to fix result ${result.id}: ${error.message}`);
    } else {
      fixedCount++;
    }
  }

  return NextResponse.json({
    success: true,
    fixed: fixedCount,
    errors: errors.length > 0 ? errors : undefined,
  });
}
