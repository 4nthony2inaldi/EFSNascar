// NASCAR Cup Series Historical Race Results Types

export interface HistoricalRaceResult {
  position: number;
  driver: string;
  carNumber: number;
  team: string;
}

export interface HistoricalRace {
  raceNumber: number;
  name: string;
  track: string;
  date: string;
  winner: string;
  winnerNumber: number;
  stage1Winner: string;
  stage1WinnerNumber: number;
  stage2Winner: string;
  stage2WinnerNumber: number;
  lapsLedWinner: string;
  lapsLedWinnerNumber: number;
  lapsLed: number;
  totalLaps: number;
  results: HistoricalRaceResult[];
}

export interface HistoricalSeason {
  year: number;
  name: string;
  champion: string;
  championTeam: string;
  races: HistoricalRace[];
}
