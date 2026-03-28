// NASCAR API Service - Uses RapidAPI NASCAR Motorsport API
// Get your FREE API key at: https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/nascar-motorsport-api

const RAPIDAPI_HOST = 'nascar-motorsport-api.p.rapidapi.com';
const RAPIDAPI_BASE_URL = `https://${RAPIDAPI_HOST}`;

export interface TransformedRaceResult {
  driverName: string;
  carNumber: number;
  teamName: string;
  finishPosition: number;
  lapsLed: number;
  isStage1Winner: boolean;
  isStage2Winner: boolean;
  isStage3Winner: boolean;
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
  stage3Winner: { name: string; carNumber: number } | null;
  mostLapsLedDriver: { name: string; carNumber: number; lapsLed: number } | null;
}

export interface ScheduleRace {
  id: string;
  name: string;
  scheduled: string;
  status: string;
  track: {
    id?: string;
    name: string;
  };
}

interface RapidApiRaceResult {
  raceId?: string;
  raceName?: string;
  trackName?: string;
  raceDate?: string;
  results?: Array<{
    position?: number;
    driverName?: string;
    driver?: string;
    carNumber?: number | string;
    car?: number | string;
    team?: string;
    teamName?: string;
    lapsLed?: number;
    manufacturer?: string;
  }>;
  stage1Winner?: string;
  stage2Winner?: string;
  status?: string;
}

class NASCARApiService {
  private apiKey: string | null = null;

  constructor() {
    // Support both RAPIDAPI_KEY and legacy SPORTRADAR_API_KEY
    this.apiKey = process.env.RAPIDAPI_KEY || process.env.SPORTRADAR_API_KEY || null;
  }

  private async fetchFromRapidApi<T>(endpoint: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'RAPIDAPI_KEY not configured. Get your free API key at https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/nascar-motorsport-api'
      );
    }

    const url = `${RAPIDAPI_BASE_URL}${endpoint}`;
    console.log('Fetching from RapidAPI:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('RapidAPI Error:', response.status, text.substring(0, 500));

      if (response.status === 403 || response.status === 401) {
        throw new Error('Invalid API key or access denied. Check your RapidAPI key.');
      }
      if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please wait before making more requests.');
      }
      if (response.status === 404) {
        throw new Error('Resource not found. The race or season may not exist.');
      }
      throw new Error(`API request failed: ${response.status} - ${text.substring(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Get Cup Series race results for a given year
   * series: 1 = Cup, 2 = Xfinity, 3 = Truck
   */
  async getSeasonResults(year: number, series: number = 1): Promise<any> {
    return this.fetchFromRapidApi(`/results?year=${year}&series=${series}`);
  }

  /**
   * Get scoreboard/schedule for a given date
   */
  async getScoreboard(year?: number, month?: number, day?: number): Promise<any> {
    let endpoint = '/scoreboard';
    const params: string[] = [];
    if (year) params.push(`year=${year}`);
    if (month) params.push(`month=${month}`);
    if (day) params.push(`day=${day}`);
    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }
    return this.fetchFromRapidApi(endpoint);
  }

  /**
   * Get current scoreboard
   */
  async getCurrentScoreboard(): Promise<any> {
    return this.fetchFromRapidApi('/current-scoreboard');
  }

  /**
   * Get detailed race report
   */
  async getRaceReport(raceId: string): Promise<any> {
    return this.fetchFromRapidApi(`/race-report?raceId=${raceId}`);
  }

  /**
   * Get race results for a specific driver
   * Returns the driver's finishing positions across all races for the year
   */
  async getDriverRaceResults(driverId: string, year: number): Promise<any> {
    return this.fetchFromRapidApi(`/race-results?driverId=${driverId}&year=${year}`);
  }

  /**
   * Get all races for a year - transforms results into schedule format
   */
  async getRacesForYear(year: number): Promise<ScheduleRace[]> {
    try {
      const data = await this.getSeasonResults(year, 1); // Cup Series

      if (!data || !Array.isArray(data)) {
        console.log('Unexpected data format:', typeof data, Object.keys(data || {}));
        // If data is an object with races array
        const races = data?.races || data?.results || data?.schedule || [];
        if (!Array.isArray(races)) {
          return [];
        }
        return this.transformToScheduleFormat(races);
      }

      return this.transformToScheduleFormat(data);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      throw error;
    }
  }

  private transformToScheduleFormat(races: any[]): ScheduleRace[] {
    return races.map((race: any, index: number) => ({
      id: race.raceId || race.id || `race-${index + 1}`,
      name: race.raceName || race.name || 'Unknown Race',
      scheduled: race.raceDate || race.date || race.scheduled || '',
      status: race.status || 'closed',
      track: {
        id: race.trackId,
        name: race.trackName || race.track || 'Unknown Track',
      },
    }));
  }

  /**
   * Get race results by race ID
   */
  async getRaceResults(raceId: string): Promise<any> {
    return this.getRaceReport(raceId);
  }

  /**
   * Find a race by name for a given year
   */
  async findRaceByName(year: number, raceName: string): Promise<ScheduleRace | null> {
    const races = await this.getRacesForYear(year);

    // Try exact match first
    let race = races.find(r =>
      r.name.toLowerCase() === raceName.toLowerCase()
    );

    // Try partial match if no exact match
    if (!race) {
      const searchTerms = raceName.toLowerCase().split(' ').filter(t => t.length > 3);
      race = races.find(r =>
        searchTerms.some(term => r.name.toLowerCase().includes(term))
      );
    }

    return race || null;
  }

  /**
   * Transform API results into our app format
   */
  transformRaceResults(raceData: any): TransformedRaceData {
    const results = raceData.results || raceData.finishing_order || [];

    // Find most laps led
    let mostLapsLedDriver: string | null = null;
    let maxLapsLed = 0;

    results.forEach((r: any) => {
      const lapsLed = r.lapsLed || r.laps_led || 0;
      if (lapsLed > maxLapsLed) {
        maxLapsLed = lapsLed;
        mostLapsLedDriver = r.driverName || r.driver || r.driver_name || r.full_name;
      }
    });

    // Extract stage winners
    let stage1Winner: { name: string; carNumber: number } | null = null;
    let stage2Winner: { name: string; carNumber: number } | null = null;
    let stage3Winner: { name: string; carNumber: number } | null = null;

    if (raceData.stage1Winner) {
      const winner = results.find((r: any) =>
        (r.driverName || r.driver) === raceData.stage1Winner
      );
      stage1Winner = {
        name: raceData.stage1Winner,
        carNumber: winner ? parseInt(winner.carNumber || winner.car || '0') : 0,
      };
    }

    if (raceData.stage2Winner) {
      const winner = results.find((r: any) =>
        (r.driverName || r.driver) === raceData.stage2Winner
      );
      stage2Winner = {
        name: raceData.stage2Winner,
        carNumber: winner ? parseInt(winner.carNumber || winner.car || '0') : 0,
      };
    }

    if (raceData.stage3Winner) {
      const winner = results.find((r: any) =>
        (r.driverName || r.driver) === raceData.stage3Winner
      );
      stage3Winner = {
        name: raceData.stage3Winner,
        carNumber: winner ? parseInt(winner.carNumber || winner.car || '0') : 0,
      };
    }

    // Also check for stages array format
    if (raceData.stages && Array.isArray(raceData.stages)) {
      const stage1 = raceData.stages.find((s: any) => s.number === 1 || s.stage === 1);
      const stage2 = raceData.stages.find((s: any) => s.number === 2 || s.stage === 2);
      const stage3 = raceData.stages.find((s: any) => s.number === 3 || s.stage === 3);

      if (stage1?.winner || stage1?.results?.[0]) {
        const winnerName = stage1.winner || stage1.results[0]?.driver || stage1.results[0]?.driverName;
        const winnerCar = stage1.results?.[0]?.car || stage1.results?.[0]?.carNumber;
        stage1Winner = {
          name: winnerName || '',
          carNumber: parseInt(winnerCar || '0'),
        };
      }

      if (stage2?.winner || stage2?.results?.[0]) {
        const winnerName = stage2.winner || stage2.results[0]?.driver || stage2.results[0]?.driverName;
        const winnerCar = stage2.results?.[0]?.car || stage2.results?.[0]?.carNumber;
        stage2Winner = {
          name: winnerName || '',
          carNumber: parseInt(winnerCar || '0'),
        };
      }

      if (stage3?.winner || stage3?.results?.[0]) {
        const winnerName = stage3.winner || stage3.results[0]?.driver || stage3.results[0]?.driverName;
        const winnerCar = stage3.results?.[0]?.car || stage3.results?.[0]?.carNumber;
        stage3Winner = {
          name: winnerName || '',
          carNumber: parseInt(winnerCar || '0'),
        };
      }
    }

    // Transform results
    const transformedResults: TransformedRaceResult[] = results
      .filter((r: any) => (r.position || r.finishPosition) > 0)
      .sort((a: any, b: any) => (a.position || a.finishPosition) - (b.position || b.finishPosition))
      .map((r: any) => {
        const driverName = r.driverName || r.driver || r.driver_name || r.full_name || 'Unknown';
        const carNumber = parseInt(r.carNumber || r.car || r.car_number || r.number || '0');
        const lapsLed = r.lapsLed || r.laps_led || 0;

        return {
          driverName,
          carNumber,
          teamName: r.team || r.teamName || r.manufacturer || 'Unknown',
          finishPosition: r.position || r.finishPosition,
          lapsLed,
          isStage1Winner: stage1Winner?.name === driverName,
          isStage2Winner: stage2Winner?.name === driverName,
          isStage3Winner: stage3Winner?.name === driverName,
          isMostLapsLed: mostLapsLedDriver === driverName && maxLapsLed > 0,
        };
      });

    return {
      raceName: raceData.raceName || raceData.name || 'Unknown Race',
      trackName: raceData.trackName || raceData.track || 'Unknown Track',
      raceDate: raceData.raceDate || raceData.date || raceData.scheduled || '',
      status: raceData.status || 'closed',
      results: transformedResults,
      stage1Winner,
      stage2Winner,
      stage3Winner,
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

  /**
   * Get the API provider name for display
   */
  getProviderName(): string {
    return 'RapidAPI NASCAR Motorsport';
  }
}

// Export singleton instance
export const nascarApi = new NASCARApiService();

// Export class for testing
export { NASCARApiService };
