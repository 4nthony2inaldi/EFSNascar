// NASCAR API Service - Uses Sportradar NASCAR v3 API
// Get your API key at: https://marketplace.sportradar.com/ (NASCAR API)

// Sportradar NASCAR API - trial access level
const SPORTRADAR_BASE_URL = 'https://api.sportradar.us/nascar-ot3';

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

class NASCARApiService {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.SPORTRADAR_API_KEY || null;
  }

  private async fetchFromSportradar<T>(endpoint: string): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'SPORTRADAR_API_KEY not configured. Get your trial key at https://marketplace.sportradar.com/'
      );
    }

    // Sportradar uses api_key as query parameter
    const url = `${SPORTRADAR_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${this.apiKey}`;

    console.log('Fetching from Sportradar:', url.replace(this.apiKey, '***'));

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Sportradar API Error:', response.status, text.substring(0, 500));

      if (response.status === 403 || response.status === 401) {
        throw new Error('Invalid API key or access denied. Check your Sportradar API key.');
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
   * Get Cup Series schedule for a given year
   * Endpoint: /sc/{year}/races/schedule.json
   */
  async getSeasonSchedule(year: number): Promise<any> {
    return this.fetchFromSportradar(`/sc/${year}/races/schedule.json`);
  }

  /**
   * Get race results by race ID
   * Endpoint: /sc/races/{race_id}/results.json
   */
  async getRaceResults(raceId: string): Promise<any> {
    return this.fetchFromSportradar(`/sc/races/${raceId}/results.json`);
  }

  /**
   * Get all races for a year with their IDs
   */
  async getRacesForYear(year: number): Promise<ScheduleRace[]> {
    try {
      const data = await this.getSeasonSchedule(year);

      // Sportradar returns { races: [...] } or { events: [...] }
      const races = data.races || data.events || data.schedule || [];

      if (!Array.isArray(races)) {
        console.log('Unexpected data format:', typeof data, Object.keys(data || {}));
        return [];
      }

      // Transform to our schedule format
      return races.map((race: any) => ({
        id: race.id,
        name: race.name || race.event_name || 'Unknown Race',
        scheduled: race.scheduled || race.start_time || race.date || '',
        status: race.status || 'scheduled',
        track: {
          id: race.track?.id,
          name: race.track?.name || race.venue?.name || 'Unknown Track',
        },
      }));
    } catch (error) {
      console.error('Error fetching schedule:', error);
      throw error;
    }
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
   * Transform Sportradar results into our app format
   */
  transformRaceResults(raceData: any): TransformedRaceData {
    const results = raceData.results || raceData.finishing_order || [];

    // Find most laps led
    let mostLapsLedDriver: string | null = null;
    let maxLapsLed = 0;

    results.forEach((r: any) => {
      const lapsLed = r.laps_led || 0;
      if (lapsLed > maxLapsLed) {
        maxLapsLed = lapsLed;
        mostLapsLedDriver = r.driver?.full_name || r.full_name || r.driver_name;
      }
    });

    // Extract stage winners from stages array
    let stage1Winner: { name: string; carNumber: number } | null = null;
    let stage2Winner: { name: string; carNumber: number } | null = null;

    if (raceData.stages && Array.isArray(raceData.stages)) {
      const stage1 = raceData.stages.find((s: any) => s.number === 1 || s.stage === 1);
      const stage2 = raceData.stages.find((s: any) => s.number === 2 || s.stage === 2);

      if (stage1?.results?.[0]) {
        const winner = stage1.results[0];
        stage1Winner = {
          name: winner.driver?.full_name || winner.full_name || '',
          carNumber: parseInt(winner.car_number || winner.number || '0'),
        };
      }

      if (stage2?.results?.[0]) {
        const winner = stage2.results[0];
        stage2Winner = {
          name: winner.driver?.full_name || winner.full_name || '',
          carNumber: parseInt(winner.car_number || winner.number || '0'),
        };
      }
    }

    // Transform results
    const transformedResults: TransformedRaceResult[] = results
      .filter((r: any) => r.position > 0)
      .sort((a: any, b: any) => a.position - b.position)
      .map((r: any) => {
        const driverName = r.driver?.full_name || r.full_name || r.driver_name || 'Unknown';
        const carNumber = parseInt(r.car_number || r.number || '0');
        const lapsLed = r.laps_led || 0;

        return {
          driverName,
          carNumber,
          teamName: r.team?.name || r.manufacturer || 'Unknown',
          finishPosition: r.position,
          lapsLed,
          isStage1Winner: stage1Winner?.name === driverName,
          isStage2Winner: stage2Winner?.name === driverName,
          isMostLapsLed: mostLapsLedDriver === driverName && maxLapsLed > 0,
        };
      });

    return {
      raceName: raceData.name || 'Unknown Race',
      trackName: raceData.track?.name || 'Unknown Track',
      raceDate: raceData.scheduled || '',
      status: raceData.status || 'closed',
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
