import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Merge two driver records into one.
 *
 * This is used when the same driver exists with different car numbers
 * (e.g., SVG with #88 and #16 after a car number change).
 *
 * GET: Preview what will be merged
 * POST: Execute the merge
 *
 * Query params:
 * - keep_driver_id: The driver record to keep
 * - merge_driver_id: The driver record to merge into the kept one
 * - update_car_number: Optional new car number for the kept driver
 */

interface MergePreview {
  keep_driver: {
    id: string;
    name: string;
    car_number: number;
    team_name: string | null;
  };
  merge_driver: {
    id: string;
    name: string;
    car_number: number;
    team_name: string | null;
  };
  affected_records: {
    race_results: number;
    picks_driver_1: number;
    picks_driver_2: number;
    picks_driver_3: number;
    driver_usage: number;
    favorite_driver: number;
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);

  const keepDriverId = url.searchParams.get('keep_driver_id');
  const mergeDriverId = url.searchParams.get('merge_driver_id');

  if (!keepDriverId || !mergeDriverId) {
    return NextResponse.json({
      error: 'Both keep_driver_id and merge_driver_id are required',
      usage: 'GET /api/admin/merge-drivers?keep_driver_id=<uuid>&merge_driver_id=<uuid>',
    }, { status: 400 });
  }

  if (keepDriverId === mergeDriverId) {
    return NextResponse.json({
      error: 'keep_driver_id and merge_driver_id must be different',
    }, { status: 400 });
  }

  // Get both drivers
  const { data: keepDriver, error: keepError } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name')
    .eq('id', keepDriverId)
    .single();

  const { data: mergeDriver, error: mergeError } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name')
    .eq('id', mergeDriverId)
    .single();

  if (keepError || !keepDriver) {
    return NextResponse.json({
      error: `Driver to keep not found: ${keepDriverId}`,
    }, { status: 404 });
  }

  if (mergeError || !mergeDriver) {
    return NextResponse.json({
      error: `Driver to merge not found: ${mergeDriverId}`,
    }, { status: 404 });
  }

  // Count affected records
  const { count: raceResultsCount } = await supabase
    .from('race_results')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', mergeDriverId);

  const { count: picksDriver1Count } = await supabase
    .from('picks')
    .select('*', { count: 'exact', head: true })
    .eq('driver_1_id', mergeDriverId);

  const { count: picksDriver2Count } = await supabase
    .from('picks')
    .select('*', { count: 'exact', head: true })
    .eq('driver_2_id', mergeDriverId);

  const { count: picksDriver3Count } = await supabase
    .from('picks')
    .select('*', { count: 'exact', head: true })
    .eq('driver_3_id', mergeDriverId);

  const { count: driverUsageCount } = await supabase
    .from('driver_usage')
    .select('*', { count: 'exact', head: true })
    .eq('driver_id', mergeDriverId);

  const { count: favoriteDriverCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('favorite_driver_id', mergeDriverId);

  const preview: MergePreview = {
    keep_driver: keepDriver,
    merge_driver: mergeDriver,
    affected_records: {
      race_results: raceResultsCount || 0,
      picks_driver_1: picksDriver1Count || 0,
      picks_driver_2: picksDriver2Count || 0,
      picks_driver_3: picksDriver3Count || 0,
      driver_usage: driverUsageCount || 0,
      favorite_driver: favoriteDriverCount || 0,
    },
  };

  const totalAffected =
    (raceResultsCount || 0) +
    (picksDriver1Count || 0) +
    (picksDriver2Count || 0) +
    (picksDriver3Count || 0) +
    (driverUsageCount || 0) +
    (favoriteDriverCount || 0);

  return NextResponse.json({
    preview,
    total_records_to_update: totalAffected,
    warning: totalAffected > 0
      ? `This will update ${totalAffected} records and delete driver "${mergeDriver.name}" (#${mergeDriver.car_number})`
      : 'No records reference the merge driver - only the driver record will be deleted',
    instructions: 'POST to this endpoint with the same parameters to execute the merge',
  });
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const { keep_driver_id, merge_driver_id, update_car_number } = body;

  if (!keep_driver_id || !merge_driver_id) {
    return NextResponse.json({
      error: 'Both keep_driver_id and merge_driver_id are required in request body',
    }, { status: 400 });
  }

  if (keep_driver_id === merge_driver_id) {
    return NextResponse.json({
      error: 'keep_driver_id and merge_driver_id must be different',
    }, { status: 400 });
  }

  // Verify both drivers exist
  const { data: keepDriver } = await supabase
    .from('drivers')
    .select('id, name, car_number')
    .eq('id', keep_driver_id)
    .single();

  const { data: mergeDriver } = await supabase
    .from('drivers')
    .select('id, name, car_number')
    .eq('id', merge_driver_id)
    .single();

  if (!keepDriver) {
    return NextResponse.json({ error: `Driver to keep not found: ${keep_driver_id}` }, { status: 404 });
  }

  if (!mergeDriver) {
    return NextResponse.json({ error: `Driver to merge not found: ${merge_driver_id}` }, { status: 404 });
  }

  const updates: string[] = [];
  const errors: string[] = [];

  // 1. Update race_results
  const { error: raceResultsError, count: raceResultsCount } = await supabase
    .from('race_results')
    .update({ driver_id: keep_driver_id })
    .eq('driver_id', merge_driver_id);

  if (raceResultsError) {
    errors.push(`Failed to update race_results: ${raceResultsError.message}`);
  } else {
    updates.push(`Updated ${raceResultsCount || 0} race_results records`);
  }

  // 2. Update picks (all three driver slots)
  const { error: picks1Error, count: picks1Count } = await supabase
    .from('picks')
    .update({ driver_1_id: keep_driver_id })
    .eq('driver_1_id', merge_driver_id);

  if (picks1Error) {
    errors.push(`Failed to update picks.driver_1_id: ${picks1Error.message}`);
  } else {
    updates.push(`Updated ${picks1Count || 0} picks (driver_1)`);
  }

  const { error: picks2Error, count: picks2Count } = await supabase
    .from('picks')
    .update({ driver_2_id: keep_driver_id })
    .eq('driver_2_id', merge_driver_id);

  if (picks2Error) {
    errors.push(`Failed to update picks.driver_2_id: ${picks2Error.message}`);
  } else {
    updates.push(`Updated ${picks2Count || 0} picks (driver_2)`);
  }

  const { error: picks3Error, count: picks3Count } = await supabase
    .from('picks')
    .update({ driver_3_id: keep_driver_id })
    .eq('driver_3_id', merge_driver_id);

  if (picks3Error) {
    errors.push(`Failed to update picks.driver_3_id: ${picks3Error.message}`);
  } else {
    updates.push(`Updated ${picks3Count || 0} picks (driver_3)`);
  }

  // 3. Handle driver_usage - need to merge counts if both exist for same team/season
  const { data: mergeUsage } = await supabase
    .from('driver_usage')
    .select('*')
    .eq('driver_id', merge_driver_id);

  for (const usage of mergeUsage || []) {
    // Check if keep_driver already has usage for this team/season
    const { data: existingUsage } = await supabase
      .from('driver_usage')
      .select('*')
      .eq('driver_id', keep_driver_id)
      .eq('team_id', usage.team_id)
      .eq('season_id', usage.season_id)
      .single();

    if (existingUsage) {
      // Merge: add times_used together
      const { error: mergeUsageError } = await supabase
        .from('driver_usage')
        .update({ times_used: existingUsage.times_used + usage.times_used })
        .eq('id', existingUsage.id);

      if (mergeUsageError) {
        errors.push(`Failed to merge driver_usage: ${mergeUsageError.message}`);
      }

      // Delete the old record
      await supabase.from('driver_usage').delete().eq('id', usage.id);
    } else {
      // Just update driver_id
      const { error: usageError } = await supabase
        .from('driver_usage')
        .update({ driver_id: keep_driver_id })
        .eq('id', usage.id);

      if (usageError) {
        errors.push(`Failed to update driver_usage: ${usageError.message}`);
      }
    }
  }
  updates.push(`Processed ${mergeUsage?.length || 0} driver_usage records`);

  // 4. Update teams.favorite_driver_id
  const { error: favoriteError, count: favoriteCount } = await supabase
    .from('teams')
    .update({ favorite_driver_id: keep_driver_id })
    .eq('favorite_driver_id', merge_driver_id);

  if (favoriteError) {
    errors.push(`Failed to update teams.favorite_driver_id: ${favoriteError.message}`);
  } else {
    updates.push(`Updated ${favoriteCount || 0} teams favorite_driver`);
  }

  // 5. Optionally update car number on kept driver
  if (update_car_number !== undefined) {
    const { error: carNumberError } = await supabase
      .from('drivers')
      .update({ car_number: update_car_number })
      .eq('id', keep_driver_id);

    if (carNumberError) {
      errors.push(`Failed to update car_number: ${carNumberError.message}`);
    } else {
      updates.push(`Updated car_number to ${update_car_number}`);
    }
  }

  // 6. Delete the merged driver record
  const { error: deleteError } = await supabase
    .from('drivers')
    .delete()
    .eq('id', merge_driver_id);

  if (deleteError) {
    errors.push(`Failed to delete merged driver: ${deleteError.message}`);
  } else {
    updates.push(`Deleted driver "${mergeDriver.name}" (#${mergeDriver.car_number})`);
  }

  return NextResponse.json({
    success: errors.length === 0,
    message: errors.length === 0
      ? `Successfully merged "${mergeDriver.name}" into "${keepDriver.name}"`
      : 'Merge completed with errors',
    kept_driver: {
      id: keep_driver_id,
      name: keepDriver.name,
      car_number: update_car_number ?? keepDriver.car_number,
    },
    merged_driver: {
      id: merge_driver_id,
      name: mergeDriver.name,
      car_number: mergeDriver.car_number,
    },
    updates,
    errors: errors.length > 0 ? errors : undefined,
  });
}
