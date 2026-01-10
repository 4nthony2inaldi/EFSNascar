// NASCAR API Service - Uses RapidAPI NASCAR Motorsport API
// Get your API key at: https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/nascar-motorsport-api

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
    this.apiKey = process.env.RAPIDAPI_KEY || process.env.SPORTRADAR_API_KEY || null;
  }

  private async fetchFromRapidApi<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'API key not configured. Add RAPIDAPI_KEY or SPORTRADAR_API_KEY to your environment variables.'
      );
    }

    const url = new URL(`${RAPIDAPI_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    console.log('Fetching from:', url.toString());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('API Error:', response.status, text);

      if (response.status === 403 || response.status === 401) {
        throw new Error('Invalid API key or access denied. Check your Sportradar API key.');
      }
      if (response.status === 429) {
        throw new Error('API rate limit exceeded. Please wait before making more requests.');
      }
      throw new Error(`API request failed: ${response.status} - ${text.substring(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Get race results for a specific year from RapidAPI
   */
  async getSeasonResults(year: number, series: number = 1): Promise<any> {
    return this.fetchFromRapidApi('/results', {
      year: year.toString(),
      series: series.toString(),
    });
  }

  /**
   * Get all races/results for a year
   */
  async getRacesForYear(year: number): Promise<ScheduleRace[]> {
    try {
      const data = await this.getSeasonResults(year, 1);

      // Handle different response formats
      const races = data.results || data.races || data || [];

      if (!Array.isArray(races)) {
        console.log('Unexpected data format:', typeof data, Object.keys(data || {}));
        return [];
      }

      // Transform to our schedule format
      return races.map((race: any, index: number) => ({
        id: race.race_id || race.id || `${year}-${index}`,
        name: race.race_name || race.name || `Race ${index + 1}`,
        scheduled: race.race_date || race.date || race.scheduled || '',
        status: race.status || 'closed',
        track: {
          id: race.track_id,
          name: race.track_name || race.track || 'Unknown Track',
        },
      }));
    } catch (error) {
      console.error('Error fetching races:', error);
      throw error;
    }
  }

  /**
   * Get detailed race report by race ID
   */
  async getRaceResults(raceId: string): Promise<any> {
    return this.fetchFromRapidApi('/race-report', {
      raceId,
    });
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
      const searchTerms = raceName.toLowerCase().split(' ').filter(t => t.length > 2);
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
    const results = raceData.results || raceData.race_results || raceData.finishing_order || [];

    // Find most laps led
    let mostLapsLedDriver: string | null = null;
    let maxLapsLed = 0;

    results.forEach((r: any) => {
      const lapsLed = r.laps_led || r.lapsLed || 0;
      if (lapsLed > maxLapsLed) {
        maxLapsLed = lapsLed;
        mostLapsLedDriver = r.driver_name || r.driver || r.full_name || r.name;
      }
    });

    // Extract stage winners from various possible formats
    let stage1Winner: { name: string; carNumber: number } | null = null;
    let stage2Winner: { name: string; carNumber: number } | null = null;

    const s1 = raceData.stage_1_winner || raceData.stage1Winner || raceData.stage1_winner;
    const s2 = raceData.stage_2_winner || raceData.stage2Winner || raceData.stage2_winner;

    if (s1) {
      stage1Winner = {
        name: typeof s1 === 'string' ? s1 : (s1.driver_name || s1.name || s1.driver),
        carNumber: typeof s1 === 'string' ? 0 : parseInt(s1.car_number || s1.carNumber || '0'),
      };
    }

    if (s2) {
      stage2Winner = {
        name: typeof s2 === 'string' ? s2 : (s2.driver_name || s2.name || s2.driver),
        carNumber: typeof s2 === 'string' ? 0 : parseInt(s2.car_number || s2.carNumber || '0'),
      };
    }

    // Transform results
    const transformedResults: TransformedRaceResult[] = results
      .filter((r: any) => {
        const pos = r.finishing_position || r.position || r.finish_position || r.pos;
        return pos && pos > 0;
      })
      .sort((a: any, b: any) => {
        const posA = a.finishing_position || a.position || a.finish_position || a.pos;
        const posB = b.finishing_position || b.position || b.finish_position || b.pos;
        return posA - posB;
      })
      .map((r: any) => {
        const driverName = r.driver_name || r.driver || r.full_name || r.name || 'Unknown';
        const carNumber = parseInt(r.car_number || r.carNumber || r.car || '0');
        const lapsLed = r.laps_led || r.lapsLed || 0;

        return {
          driverName,
          carNumber,
          teamName: r.team_name || r.team || r.manufacturer || 'Unknown',
          finishPosition: r.finishing_position || r.position || r.finish_position || r.pos,
          lapsLed,
          isStage1Winner: stage1Winner?.name?.toLowerCase() === driverName.toLowerCase(),
          isStage2Winner: stage2Winner?.name?.toLowerCase() === driverName.toLowerCase(),
          isMostLapsLed: mostLapsLedDriver?.toLowerCase() === driverName.toLowerCase() && maxLapsLed > 0,
        };
      });

    return {
      raceName: raceData.race_name || raceData.name || 'Unknown Race',
      trackName: raceData.track_name || raceData.track || 'Unknown Track',
      raceDate: raceData.race_date || raceData.date || raceData.scheduled || '',
      status: raceData.status || 'complete',
      results: transformedResults,
      stage1Winner,
      stage2Winner,
      mostLapsLedDriver: mostLapsLedDriver ? {
        name: mostLapsLedDriver,
        carNumber: transformedResults.find(r => r.driverName.toLowerCase() === mostLapsLedDriver?.toLowerCase())?.carNumber || 0,
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
