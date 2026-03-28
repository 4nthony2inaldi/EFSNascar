'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Hook for persistent season selection across pages.
 * Stores selected season year in URL query params (?season=2023)
 * so it persists as users navigate between pages.
 */
export function useSeasonSelection() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Get season year from URL, returns null if not set
  const seasonYearFromUrl = searchParams.get('season');
  const selectedSeasonYear = seasonYearFromUrl ? parseInt(seasonYearFromUrl, 10) : null;

  // Update URL with new season year
  const setSeasonYear = useCallback((year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('season', year.toString());
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Build URL with season param for navigation links
  const buildSeasonUrl = useCallback((path: string, year?: number) => {
    const yearToUse = year ?? selectedSeasonYear;
    if (yearToUse) {
      return `${path}?season=${yearToUse}`;
    }
    return path;
  }, [selectedSeasonYear]);

  return {
    selectedSeasonYear,
    setSeasonYear,
    buildSeasonUrl,
  };
}
