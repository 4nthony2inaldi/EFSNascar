// NASCAR Cup Series Historical Data - Types Only
// Race data is now stored in the database and fetched via API
export * from './types';

import type { HistoricalSeason } from './types';

// Empty array - historical data is now fetched from the database
// The history page will be updated to fetch from API
export const nascarHistory: HistoricalSeason[] = [];
