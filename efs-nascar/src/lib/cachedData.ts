// Cached data functions with revalidation support
// These expensive calculations are cached and only revalidated when data changes

import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { calculateDriverTiers } from '@/lib/driverTiers';

// Cache tags for revalidation
export const CACHE_TAGS = {
  DRIVER_TIERS: 'driver-tiers',
  STANDINGS: 'standings',
  TITS_STATS: 'tits-stats',
} as const;

/**
 * Get cached driver tiers
 * Revalidates when race results are imported (via revalidateTag)
 */
export const getCachedDriverTiers = unstable_cache(
  async (): Promise<Map<string, number>> => {
    const supabase = await createClient();
    console.log('[Cache] Calculating driver tiers...');
    const tiers = await calculateDriverTiers(supabase);
    console.log(`[Cache] Driver tiers calculated: ${tiers.size} drivers`);
    return tiers;
  },
  ['driver-tiers'],
  {
    tags: [CACHE_TAGS.DRIVER_TIERS],
    revalidate: 3600, // Also revalidate after 1 hour as fallback
  }
);

/**
 * Wrapper that converts Map to/from serializable format for caching
 * (unstable_cache requires serializable return values)
 */
export async function getDriverTiersFromCache(): Promise<Map<string, number>> {
  const supabase = await createClient();

  // Use a simpler caching approach - store in a database table
  // Check if we have recent cached tiers (within last hour)
  const { data: cachedTiers } = await supabase
    .from('cached_driver_tiers')
    .select('*')
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single();

  // If we have recent cached data (within 1 hour), use it
  if (cachedTiers && cachedTiers.tiers_data) {
    const calculatedAt = new Date(cachedTiers.calculated_at);
    const ageMs = Date.now() - calculatedAt.getTime();
    const oneHour = 60 * 60 * 1000;

    if (ageMs < oneHour) {
      // Convert stored object back to Map
      const tiersObj = cachedTiers.tiers_data as Record<string, number>;
      return new Map(Object.entries(tiersObj));
    }
  }

  // Calculate fresh tiers
  console.log('[Cache] Calculating fresh driver tiers...');
  const freshTiers = await calculateDriverTiers(supabase);

  // Store in cache table (upsert)
  const tiersObj = Object.fromEntries(freshTiers);
  await supabase
    .from('cached_driver_tiers')
    .upsert({
      id: 'current',
      tiers_data: tiersObj,
      calculated_at: new Date().toISOString(),
    });

  return freshTiers;
}

/**
 * Invalidate driver tiers cache (call after importing race results)
 */
export async function invalidateDriverTiersCache(): Promise<void> {
  const supabase = await createClient();

  // Delete cached data to force recalculation on next request
  await supabase
    .from('cached_driver_tiers')
    .delete()
    .eq('id', 'current');

  console.log('[Cache] Driver tiers cache invalidated');
}

/**
 * Pre-calculate and cache driver tiers (call after importing race results)
 */
export async function refreshDriverTiersCache(): Promise<Map<string, number>> {
  const supabase = await createClient();

  console.log('[Cache] Refreshing driver tiers cache...');
  const freshTiers = await calculateDriverTiers(supabase);

  // Store in cache table
  const tiersObj = Object.fromEntries(freshTiers);
  await supabase
    .from('cached_driver_tiers')
    .upsert({
      id: 'current',
      tiers_data: tiersObj,
      calculated_at: new Date().toISOString(),
    });

  console.log(`[Cache] Driver tiers cache refreshed: ${freshTiers.size} drivers`);
  return freshTiers;
}
