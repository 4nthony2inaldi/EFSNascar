import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ParsedRow {
  week: number;
  race: string;
  team: string;
  driver1: string;
  driver2: string;
  driver3: string;
}

// Fuzzy matching helpers
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function fuzzyMatch(input: string, candidates: Array<{ id: string; name: string; [key: string]: any }>): { id: string; name: string; [key: string]: any } | null {
  const normalizedInput = normalize(input);

  // Try exact match first
  const exact = candidates.find(c => normalize(c.name) === normalizedInput);
  if (exact) return exact;

  // Try contains match
  const contains = candidates.find(c =>
    normalize(c.name).includes(normalizedInput) ||
    normalizedInput.includes(normalize(c.name))
  );
  if (contains) return contains;

  // Try word-based match (any word matches)
  const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 2);
  for (const candidate of candidates) {
    const candidateNorm = normalize(candidate.name);
    for (const word of inputWords) {
      if (candidateNorm.includes(word) && word.length > 3) {
        return candidate;
      }
    }
  }

  return null;
}

// Special race name mappings
const RACE_NAME_ALIASES: Record<string, string[]> = {
  'daytona': ['daytona 500', 'daytona', 'great american race'],
  'atlanta': ['ambetter health 400', 'atlanta', 'quaker state 400'],
  'vegas': ['las vegas', 'pennzoil 400', 'south point 400'],
  'phoenix': ['phoenix', 'ruoff mortgage 500', 'championship'],
  'cota': ['circuit of the americas', 'echopark', 'cota'],
  'richmond': ['richmond', 'toyota owners 400'],
  'martinsville': ['martinsville', 'xfinity 500', 'blue-emu'],
  'bristol': ['bristol', 'food city', 'bass pro'],
  'talladega': ['talladega', 'geico 500', 'yellawood'],
  'dover': ['dover', 'wurth 400'],
  'kansas': ['kansas', 'adventhealth 400'],
  'darlington': ['darlington', 'goodyear 400', 'southern 500', 'cook out'],
  'charlotte': ['charlotte', 'coca-cola 600', 'roval', 'bank of america'],
  'gateway': ['gateway', 'enjoy illinois 300', 'wwt raceway'],
  'sonoma': ['sonoma', 'toyota/save mart'],
  'nashville': ['nashville', 'ally 400'],
  'chicago': ['chicago street', 'grant park'],
  'pocono': ['pocono', 'great american getaway'],
  'indy': ['indianapolis', 'brickyard 400', 'indy'],
  'michigan': ['michigan', 'firekeepers casino'],
  'watkins': ['watkins glen', 'go bowling'],
  'iowa': ['iowa', 'hy-vee'],
  'newham': ['new hampshire', 'loudon', 'usa today'],
  'homestead': ['homestead', 'homestead-miami', '4ever 400'],
};

function fuzzyMatchRace(
  input: string,
  week: number,
  races: Array<{ id: string; name: string; race_number: number; race_type: string }>
): { id: string; name: string; race_number: number } | null {
  const normalizedInput = normalize(input);

  // Filter out exhibition races for "week" matching
  const pointsRaces = races.filter(r => r.race_type !== 'exhibition');
  const sortedPointsRaces = [...pointsRaces].sort((a, b) => a.race_number - b.race_number);

  // PRIORITY 1: Use week number directly if provided
  // Week X maps to the Xth points race of the season
  if (week > 0 && week <= sortedPointsRaces.length) {
    const raceByWeek = sortedPointsRaces[week - 1];
    if (raceByWeek) {
      return raceByWeek;
    }
  }

  // PRIORITY 2: Find all races matching the track name
  const matchingRaces: Array<{ id: string; name: string; race_number: number; race_type: string }> = [];

  // Check direct name match
  for (const race of races) {
    const raceName = normalize(race.name);
    if (raceName.includes(normalizedInput) || normalizedInput.includes(raceName)) {
      matchingRaces.push(race);
    }
  }

  // Check alias matching if no direct matches
  if (matchingRaces.length === 0) {
    for (const [alias, patterns] of Object.entries(RACE_NAME_ALIASES)) {
      if (normalizedInput.includes(alias) || patterns.some(p => normalizedInput.includes(normalize(p)))) {
        for (const race of races) {
          const raceName = normalize(race.name);
          if (patterns.some(p => raceName.includes(normalize(p))) || raceName.includes(alias)) {
            matchingRaces.push(race);
          }
        }
        break;
      }
    }
  }

  // If multiple races match the track, use week number to pick the right one
  if (matchingRaces.length > 1 && week > 0) {
    // Sort matching races by race_number
    const sortedMatches = [...matchingRaces].sort((a, b) => a.race_number - b.race_number);

    // Find which occurrence this week corresponds to
    // Count how many of these track's races come before the target week
    let occurrenceIndex = 0;
    for (const race of sortedPointsRaces) {
      if (race.race_number <= week && matchingRaces.some(m => m.id === race.id)) {
        occurrenceIndex++;
      }
    }

    // Get the race at this track that's closest to the week number
    const targetRaceNumber = week; // Week X should be around race number X (accounting for exhibitions)
    const closestMatch = sortedMatches.reduce((closest, race) => {
      const closestDiff = Math.abs((closest?.race_number || 0) - targetRaceNumber);
      const raceDiff = Math.abs(race.race_number - targetRaceNumber);
      return raceDiff < closestDiff ? race : closest;
    }, sortedMatches[0]);

    return closestMatch;
  }

  // Return first match if only one
  if (matchingRaces.length === 1) {
    return matchingRaces[0];
  }

  // Return first match if any
  if (matchingRaces.length > 0) {
    return matchingRaces[0];
  }

  return null;
}

function parseCSV(csvData: string): ParsedRow[] {
  const lines = csvData.trim().split('\n');
  const rows: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma or tab
    const parts = line.split(/[,\t]/).map(p => p.trim());

    // Skip header row
    if (i === 0 && (parts[0].toLowerCase() === 'week' || parts[0].toLowerCase() === 'race')) {
      continue;
    }

    if (parts.length >= 6) {
      const week = parseInt(parts[0], 10) || 0;
      rows.push({
        week,
        race: parts[1],
        team: parts[2],
        driver1: parts[3],
        driver2: parts[4],
        driver3: parts[5],
      });
    }
  }

  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const { csvData, seasonId } = await request.json();

    if (!csvData || !seasonId) {
      return NextResponse.json({ error: 'Missing csvData or seasonId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch races for the season
    const { data: races, error: racesError } = await supabase
      .from('races')
      .select('id, name, race_number, race_type')
      .eq('season_id', seasonId)
      .order('race_number', { ascending: true });

    if (racesError) {
      return NextResponse.json({ error: racesError.message }, { status: 500 });
    }

    // Fetch all teams
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id, name');

    if (teamsError) {
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // Fetch all drivers
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, name');

    if (driversError) {
      return NextResponse.json({ error: driversError.message }, { status: 500 });
    }

    // Parse CSV
    const parsedRows = parseCSV(csvData);

    // Track unmatched items
    const unmatchedRaces = new Set<string>();
    const unmatchedTeams = new Set<string>();
    const unmatchedDrivers = new Set<string>();

    // Match each row
    const matched = parsedRows.map(row => {
      const raceMatch = fuzzyMatchRace(row.race, row.week, races || []);
      const teamMatch = fuzzyMatch(row.team, teams || []);
      const driver1Match = fuzzyMatch(row.driver1, drivers || []);
      const driver2Match = fuzzyMatch(row.driver2, drivers || []);
      const driver3Match = fuzzyMatch(row.driver3, drivers || []);

      if (!raceMatch) unmatchedRaces.add(`Week ${row.week}: ${row.race}`);
      if (!teamMatch) unmatchedTeams.add(row.team);
      if (!driver1Match) unmatchedDrivers.add(row.driver1);
      if (!driver2Match) unmatchedDrivers.add(row.driver2);
      if (!driver3Match) unmatchedDrivers.add(row.driver3);

      const isValid = !!(raceMatch && teamMatch && driver1Match && driver2Match && driver3Match);

      return {
        original: row,
        raceMatch: raceMatch ? { id: raceMatch.id, name: raceMatch.name, race_number: raceMatch.race_number } : null,
        teamMatch: teamMatch ? { id: teamMatch.id, name: teamMatch.name } : null,
        driver1Match: driver1Match ? { id: driver1Match.id, name: driver1Match.name } : null,
        driver2Match: driver2Match ? { id: driver2Match.id, name: driver2Match.name } : null,
        driver3Match: driver3Match ? { id: driver3Match.id, name: driver3Match.name } : null,
        isValid,
      };
    });

    return NextResponse.json({
      matched,
      unmatched: {
        races: Array.from(unmatchedRaces),
        teams: Array.from(unmatchedTeams),
        drivers: Array.from(unmatchedDrivers),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
