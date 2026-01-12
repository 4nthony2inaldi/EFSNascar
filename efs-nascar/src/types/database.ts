// Database types for EFS NASCAR Fantasy League
// These match the Supabase schema

export type TeamRole = 'member' | 'owner';
export type RaceStatus = 'upcoming' | 'in_progress' | 'final';
export type RaceType = 'regular' | 'playoff_round1' | 'playoff_round2' | 'playoff_finals' | 'exhibition';
export type TrackType = 'superspeedway' | 'intermediate' | 'short_track' | 'road_course' | 'street_course' | 'dirt';

// ============================================
// Core Entities
// ============================================

export interface Profile {
  id: string;
  email: string;
  name: string;
  is_commissioner: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string | null;
  car_number: number;
  logo_url: string | null;
  owner_headshot_url: string | null;
  favorite_driver_id: string | null;
  quote: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMembership {
  id: string;
  user_id: string;
  team_id: string;
  role: TeamRole;
  invited_at: string;
  accepted_at: string | null;
}

export interface Season {
  id: string;
  year: number;
  name: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TeamSeasonBonus {
  id: string;
  team_id: string;
  season_id: string;
  bonus_usages: number;
  notes: string | null;
}

export interface Track {
  id: string;
  name: string;
  short_name: string | null;
  location: string | null;
  track_type: TrackType;
  length_miles: number | null;
  banking_degrees: number | null;
  logo_url: string | null;
  created_at: string;
}

export interface Race {
  id: string;
  season_id: string;
  race_number: number;
  name: string;
  track: string;
  track_id: string | null;
  scheduled_datetime: string;
  deadline_datetime: string;
  race_type: RaceType;
  status: RaceStatus;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  name: string;
  car_number: number;
  team_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RaceResult {
  id: string;
  race_id: string;
  driver_id: string;
  finish_position: number;
  stage_1_winner: boolean;
  stage_2_winner: boolean;
  laps_led: number;
  most_laps_led: boolean;
  // Original API data for re-matching when drivers change car numbers
  api_driver_name: string | null;
  api_car_number: number | null;
  created_at: string;
}

export interface Pick {
  id: string;
  team_id: string;
  race_id: string;
  driver_1_id: string;
  driver_2_id: string;
  driver_3_id: string;
  submitted_at: string;
  updated_at: string;
}

export interface DriverUsage {
  id: string;
  team_id: string;
  season_id: string;
  driver_id: string;
  times_used: number;
}

export interface Standing {
  id: string;
  team_id: string;
  season_id: string;
  race_id: string | null;
  total_points: number;
  race_wins: number;
  stage_wins: number;
  top_10_bonuses: number;
  rank: number | null;
  updated_at: string;
}

export interface RaceScore {
  id: string;
  team_id: string;
  race_id: string;
  driver_1_points: number;
  driver_2_points: number;
  driver_3_points: number;
  stage_bonus: number;
  laps_led_bonus: number;
  top_10_bonus: number;
  total_points: number;
  calculated_at: string;
}

export interface Announcement {
  id: string;
  author_id: string;
  title: string;
  body: string;
  posted_at: string;
}

// ============================================
// Extended Types (with relations)
// ============================================

export interface TeamWithMembers extends Team {
  team_memberships: (TeamMembership & { profile: Profile })[];
}

export interface TeamWithFavoriteDriver extends Team {
  favorite_driver: Driver | null;
}

export interface TeamMembershipWithDetails extends TeamMembership {
  profile: Profile;
  team: Team;
}

export interface RaceWithResults extends Race {
  race_results: (RaceResult & { driver: Driver })[];
}

export interface RaceWithTrack extends Race {
  track_info: Track | null;
}

export interface PickWithDrivers extends Pick {
  driver_1: Driver;
  driver_2: Driver;
  driver_3: Driver;
  team: Team;
}

export interface StandingWithTeam extends Standing {
  team: Team;
}

export interface RaceScoreWithDetails extends RaceScore {
  team: Team;
  race: Race;
}

export interface DriverUsageWithDriver extends DriverUsage {
  driver: Driver;
}

export interface AnnouncementWithAuthor extends Announcement {
  author: Profile;
}

// ============================================
// Form/Input Types
// ============================================

export interface CreateTeamInput {
  name: string;
  car_number: number;
  logo_url?: string;
  owner_headshot_url?: string;
  favorite_driver_id?: string;
  quote?: string;
  bio?: string;
}

export interface CreateSeasonInput {
  year: number;
  name: string;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
}

export interface CreateRaceInput {
  season_id: string;
  race_number: number;
  name: string;
  track: string;
  scheduled_datetime: string;
  deadline_datetime: string;
  race_type?: RaceType;
}

export interface CreateDriverInput {
  name: string;
  car_number: number;
  team_name?: string;
  is_active?: boolean;
}

export interface SubmitPickInput {
  team_id: string;
  race_id: string;
  driver_1_id: string;
  driver_2_id: string;
  driver_3_id: string;
}

export interface CreateRaceResultInput {
  race_id: string;
  driver_id: string;
  finish_position: number;
  stage_1_winner?: boolean;
  stage_2_winner?: boolean;
  laps_led?: number;
  most_laps_led?: boolean;
  // Original API data for re-matching when drivers change car numbers
  api_driver_name?: string;
  api_car_number?: number;
}

// ============================================
// Scoring Constants
// ============================================

export const POSITION_POINTS: Record<number, number> = {
  1: 10,
  2: 9,
  3: 8,
  4: 7,
  5: 6,
  6: 5,
  7: 4,
  8: 3,
  9: 2,
  10: 1,
};

export const BASE_DRIVER_USES = 4;
export const DEFAULT_BONUS_USES = 1;

// ============================================
// Utility Types
// ============================================

export interface UserSession {
  user: Profile;
  team: Team | null;
  membership: TeamMembership | null;
  isCommissioner: boolean;
}

export interface DriverWithUsage extends Driver {
  times_used: number;
  max_uses: number;
  is_available: boolean;
}

export interface RacePickStatus {
  race: Race;
  hasPicked: boolean;
  pick: Pick | null;
  isDeadlinePassed: boolean;
  picksRevealed: boolean;
}
