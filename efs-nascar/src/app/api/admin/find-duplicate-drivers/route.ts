import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Find potential duplicate driver records in the database.
 *
 * This endpoint identifies drivers that may be duplicates based on:
 * 1. Similar names (normalized comparison)
 * 2. Same car number (which may indicate a driver who changed cars)
 *
 * It also shows the number of results and picks for each driver to help
 * determine which record should be kept when merging.
 */

// Helper to normalize names for comparison
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '') // Remove non-alpha characters (like Jr., III)
    .replace(/\s+/g, ' ')     // Normalize spaces
    .trim();
}

// Helper to get last name
function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

// Calculate similarity between two strings (Levenshtein-based)
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

interface DriverWithStats {
  id: string;
  name: string;
  car_number: number;
  team_name: string | null;
  is_active: boolean;
  race_results_count: number;
  picks_count: number;
  total_points: number;
}

interface DuplicateGroup {
  reason: string;
  drivers: DriverWithStats[];
  suggested_action: string;
}

export async function GET() {
  const supabase = await createClient();

  // Get all drivers
  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, name, car_number, team_name, is_active')
    .order('name');

  if (driversError || !drivers) {
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }

  // Get race results counts per driver
  const { data: resultsData } = await supabase
    .from('race_results')
    .select('driver_id');

  const resultsCount: Record<string, number> = {};
  for (const r of resultsData || []) {
    resultsCount[r.driver_id] = (resultsCount[r.driver_id] || 0) + 1;
  }

  // Get picks counts per driver (across all three slots)
  const { data: picksData } = await supabase
    .from('picks')
    .select('driver_1_id, driver_2_id, driver_3_id');

  const picksCount: Record<string, number> = {};
  for (const p of picksData || []) {
    if (p.driver_1_id) picksCount[p.driver_1_id] = (picksCount[p.driver_1_id] || 0) + 1;
    if (p.driver_2_id) picksCount[p.driver_2_id] = (picksCount[p.driver_2_id] || 0) + 1;
    if (p.driver_3_id) picksCount[p.driver_3_id] = (picksCount[p.driver_3_id] || 0) + 1;
  }

  // Calculate points per driver from race_results
  const { data: resultsWithPoints } = await supabase
    .from('race_results')
    .select('driver_id, finish_position, stage_1_winner, stage_2_winner, most_laps_led');

  const pointsPerDriver: Record<string, number> = {};
  const POSITION_POINTS: Record<number, number> = {
    1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1
  };

  for (const r of resultsWithPoints || []) {
    let points = POSITION_POINTS[r.finish_position] || 0;
    if (r.stage_1_winner) points += 1;
    if (r.stage_2_winner) points += 1;
    if (r.most_laps_led) points += 1;
    pointsPerDriver[r.driver_id] = (pointsPerDriver[r.driver_id] || 0) + points;
  }

  // Build driver stats
  const driversWithStats: DriverWithStats[] = drivers.map(d => ({
    ...d,
    race_results_count: resultsCount[d.id] || 0,
    picks_count: picksCount[d.id] || 0,
    total_points: pointsPerDriver[d.id] || 0,
  }));

  // Find duplicates
  const duplicateGroups: DuplicateGroup[] = [];
  const processedPairs = new Set<string>();

  // 1. Find drivers with exact same normalized name
  const byNormalizedName: Record<string, DriverWithStats[]> = {};
  for (const d of driversWithStats) {
    const normalized = normalizeName(d.name);
    if (!byNormalizedName[normalized]) {
      byNormalizedName[normalized] = [];
    }
    byNormalizedName[normalized].push(d);
  }

  for (const [normalized, group] of Object.entries(byNormalizedName)) {
    if (group.length > 1) {
      const pairKey = group.map(d => d.id).sort().join('|');
      if (!processedPairs.has(pairKey)) {
        processedPairs.add(pairKey);

        // Suggest keeping the one with more results/points
        const sorted = [...group].sort((a, b) =>
          (b.race_results_count + b.total_points) - (a.race_results_count + a.total_points)
        );

        duplicateGroups.push({
          reason: `Same normalized name: "${normalized}"`,
          drivers: group,
          suggested_action: group.length === 2
            ? `Merge "${sorted[1].name}" (#${sorted[1].car_number}) into "${sorted[0].name}" (#${sorted[0].car_number})`
            : `Review and merge ${group.length} records`,
        });
      }
    }
  }

  // 2. Find drivers with same last name but different car numbers (potential car number change)
  const byLastName: Record<string, DriverWithStats[]> = {};
  for (const d of driversWithStats) {
    const lastName = getLastName(d.name);
    if (!byLastName[lastName]) {
      byLastName[lastName] = [];
    }
    byLastName[lastName].push(d);
  }

  for (const [lastName, group] of Object.entries(byLastName)) {
    if (group.length > 1) {
      // Check if they have different car numbers (potential duplicate from car change)
      const carNumbers = new Set(group.map(d => d.car_number));
      if (carNumbers.size > 1) {
        const pairKey = group.map(d => d.id).sort().join('|');
        if (!processedPairs.has(pairKey)) {
          // Check if names are similar enough
          const names = group.map(d => normalizeName(d.name));
          const areSimilar = names.every((n1, i) =>
            names.every((n2, j) => i === j || similarity(n1, n2) > 0.7)
          );

          if (areSimilar) {
            processedPairs.add(pairKey);

            const sorted = [...group].sort((a, b) =>
              (b.race_results_count + b.total_points) - (a.race_results_count + a.total_points)
            );

            duplicateGroups.push({
              reason: `Same last name "${lastName}" with different car numbers: ${Array.from(carNumbers).join(', ')}`,
              drivers: group,
              suggested_action: `Possible car number change - merge records if same person`,
            });
          }
        }
      }
    }
  }

  // 3. Find drivers with high name similarity (catch typos, formatting differences)
  for (let i = 0; i < driversWithStats.length; i++) {
    for (let j = i + 1; j < driversWithStats.length; j++) {
      const d1 = driversWithStats[i];
      const d2 = driversWithStats[j];
      const pairKey = [d1.id, d2.id].sort().join('|');

      if (processedPairs.has(pairKey)) continue;

      const sim = similarity(normalizeName(d1.name), normalizeName(d2.name));
      if (sim > 0.85 && sim < 1.0) {
        processedPairs.add(pairKey);

        const sorted = [d1, d2].sort((a, b) =>
          (b.race_results_count + b.total_points) - (a.race_results_count + a.total_points)
        );

        duplicateGroups.push({
          reason: `Similar names (${Math.round(sim * 100)}% match)`,
          drivers: [d1, d2],
          suggested_action: `Review: "${d1.name}" vs "${d2.name}"`,
        });
      }
    }
  }

  // Summary stats
  const totalDrivers = drivers.length;
  const driversWithResults = driversWithStats.filter(d => d.race_results_count > 0).length;
  const driversWithoutResults = totalDrivers - driversWithResults;

  return NextResponse.json({
    summary: {
      total_drivers: totalDrivers,
      drivers_with_results: driversWithResults,
      drivers_without_results: driversWithoutResults,
      potential_duplicate_groups: duplicateGroups.length,
      total_drivers_in_duplicate_groups: new Set(duplicateGroups.flatMap(g => g.drivers.map(d => d.id))).size,
    },
    duplicate_groups: duplicateGroups,
    instructions: duplicateGroups.length > 0
      ? 'Use GET /api/admin/merge-drivers?keep_driver_id=<id>&merge_driver_id=<id> to preview a merge'
      : 'No duplicate drivers detected',
  });
}
