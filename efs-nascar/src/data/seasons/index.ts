// NASCAR Cup Series Historical Data - Main Index
export * from './types';
export { season2020 } from './2020';
export { season2021 } from './2021';
export { season2022 } from './2022';
export { season2023 } from './2023';
export { season2024 } from './2024';
export { season2025 } from './2025';
export { season2026 } from './2026';

import { season2020 } from './2020';
import { season2021 } from './2021';
import { season2022 } from './2022';
import { season2023 } from './2023';
import { season2024 } from './2024';
import { season2025 } from './2025';
import { season2026 } from './2026';
import type { HistoricalSeason } from './types';

// Export all seasons (most recent first)
export const nascarHistory: HistoricalSeason[] = [
  season2026,
  season2025,
  season2024,
  season2023,
  season2022,
  season2021,
  season2020,
];

// Helper function to get season by year
export function getSeasonByYear(year: number): HistoricalSeason | undefined {
  return nascarHistory.find(season => season.year === year);
}

// Helper function to get all race winners across all seasons
export function getAllRaceWinners(): { driver: string; wins: number }[] {
  const winnerMap = new Map<string, number>();

  nascarHistory.forEach(season => {
    season.races.forEach(race => {
      const current = winnerMap.get(race.winner) || 0;
      winnerMap.set(race.winner, current + 1);
    });
  });

  return Array.from(winnerMap.entries())
    .map(([driver, wins]) => ({ driver, wins }))
    .sort((a, b) => b.wins - a.wins);
}

// Helper function to get total races in database
export function getTotalRaces(): number {
  return nascarHistory.reduce((total, season) => total + season.races.length, 0);
}
