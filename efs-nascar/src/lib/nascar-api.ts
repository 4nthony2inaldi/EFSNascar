// NASCAR API Service - Uses Sportradar NASCAR v3 API
// Get your free trial API key at: https://developer.sportradar.com/

const SPORTRADAR_BASE_URL = 'https://api.sportradar.com/nascar/trial/v3/en';

export interface SportradarDriver {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  car_number: string;
  team: {
    id: string;
    name: string;
  };
}

export interface SportradarRaceResult {
  id: string;
  status: string;
  position: number;
  car_number: string;
  driver: SportradarDriver;
  laps_completed: number;
  laps_led: number;
  points: number;
  money: number;
  status_description: string;
}

export interface SportradarStageResult {
  stage_number: number;
  results: Array<{
    position: number;
    car_number: string;
    driver: SportradarDriver;
  }>;
}

export interface SportradarRace {
  id: string;
  name: string;
  scheduled: string;
  status: string;
  track: {
    id: string;
    name: string;
  };
  results?: SportradarRaceResult[];
  stages?: SportradarStageResult[];
  laps: number;
  laps_completed: number;
}

export interface SportradarScheduleRace {
  id: string;
  name: string;
  scheduled: string;
  status: string;
  track: {
    id: string;
    name: string;
  };
}

export interface SportradarSeason {
  id: string;
  year: number;
  type: {
    id: string;
    name: string;
  };
  races: SportradarScheduleRace[];
}

export interface TransformedRaceResult {
  driverName: string;
  carNumber: number;
  teamName: string;
  finishPosition: number;
  lapsLed: number;
  isStage1Winner: boolean;
  isStage2Winner: boolean;
  isMostLapsLed: boolean;
}

export interface TransformedRaceData {
  raceName: string;
  trackName: string;
  raceDate: string;
  status: string;
  results: TransformedRaceResult[];
  stage1Winner: { name: string; carNumber: number } | null;
  stage2Winner: { name: string; carNumber: number } | null;
  mostLapsLedDriver: { name: string; carNumber: number; lapsLed: number } | null;
}

class NASCARApiService {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.SPORTRADAR_API_KEY || null;
  }

  private async fetchFromApi<T>(endpoint: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'SPORTRADAR_API_KEY not configured. Get your free trial key at https://developer.sportradar.com/'
      );
    }

    const url = `${SPORTRADAR_BASE_URL}${endpoint}?api_key=${this.apiKey}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Invalid API key or access denied. Check your Sportradar API key.');
      }
      if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please wait before making more requests.');
      }
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get the Cup Series schedule for a given year
   */
  async getSeasonSchedule(year: number): Promise<SportradarSeason> {
    // sc = Cup Series
    return this.fetchFromApi<SportradarSeason>(`/sc/${year}/races/schedule.json`);
  }

  /**
   * Get race results by race ID
   */
  async getRaceResults(raceId: string): Promise<SportradarRace> {
    return this.fetchFromApi<SportradarRace>(`/sc/races/${raceId}/results.json`);
  }

  /**
   * Get all races for a year with their IDs
   */
  async getRacesForYear(year: number): Promise<SportradarScheduleRace[]> {
    const schedule = await this.getSeasonSchedule(year);
    return schedule.races || [];
  }

  /**
   * Find a race by name for a given year
   */
  async findRaceByName(year: number, raceName: string): Promise<SportradarScheduleRace | null> {
    const races = await this.getRacesForYear(year);

    // Try exact match first
    let race = races.find(r =>
      r.name.toLowerCase() === raceName.toLowerCase()
    );

    // Try partial match if no exact match
    if (!race) {
      const searchTerms = raceName.toLowerCase().split(' ');
      race = races.find(r =>
        searchTerms.some(term => r.name.toLowerCase().includes(term))
      );
    }

    return race || null;
  }

  /**
   * Transform Sportradar results into our app format
   */
  transformRaceResults(race: SportradarRace): TransformedRaceData {
    const results = race.results || [];

    // Find most laps led
    let mostLapsLedDriver: TransformedRaceResult['driverName'] | null = null;
    let maxLapsLed = 0;

    results.forEach(r => {
      if (r.laps_led > maxLapsLed) {
        maxLapsLed = r.laps_led;
        mostLapsLedDriver = r.driver.full_name;
      }
    });

    // Extract stage winners
    let stage1Winner: { name: string; carNumber: number } | null = null;
    let stage2Winner: { name: string; carNumber: number } | null = null;

    if (race.stages) {
      const stage1 = race.stages.find(s => s.stage_number === 1);
      const stage2 = race.stages.find(s => s.stage_number === 2);

      if (stage1?.results?.[0]) {
        const winner = stage1.results[0];
        stage1Winner = {
          name: winner.driver.full_name,
          carNumber: parseInt(winner.car_number) || 0,
        };
      }

      if (stage2?.results?.[0]) {
        const winner = stage2.results[0];
        stage2Winner = {
          name: winner.driver.full_name,
          carNumber: parseInt(winner.car_number) || 0,
        };
      }
    }

    // Transform results
    const transformedResults: TransformedRaceResult[] = results
      .filter(r => r.position && r.position > 0)
      .sort((a, b) => a.position - b.position)
      .map(r => ({
        driverName: r.driver.full_name,
        carNumber: parseInt(r.car_number) || 0,
        teamName: r.driver.team?.name || 'Unknown',
        finishPosition: r.position,
        lapsLed: r.laps_led || 0,
        isStage1Winner: stage1Winner?.name === r.driver.full_name,
        isStage2Winner: stage2Winner?.name === r.driver.full_name,
        isMostLapsLed: r.driver.full_name === mostLapsLedDriver && maxLapsLed > 0,
      }));

    return {
      raceName: race.name,
      trackName: race.track?.name || 'Unknown',
      raceDate: race.scheduled,
      status: race.status,
      results: transformedResults,
      stage1Winner,
      stage2Winner,
      mostLapsLedDriver: mostLapsLedDriver ? {
        name: mostLapsLedDriver,
        carNumber: transformedResults.find(r => r.driverName === mostLapsLedDriver)?.carNumber || 0,
        lapsLed: maxLapsLed,
      } : null,
    };
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Export singleton instance
export const nascarApi = new NASCARApiService();

// Export class for testing
export { NASCARApiService };
