# EFS NASCAR Fantasy League - Technical Specification

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Scoring System](#scoring-system)
5. [Driver Usage Rules](#driver-usage-rules)
6. [Season Structure](#season-structure)
7. [Playoff System](#playoff-system)
8. [User Roles & Permissions](#user-roles--permissions)
9. [Key Features](#key-features)
10. [Race Data Management](#race-data-management)
11. [NASCAR API Integration](#nascar-api-integration)
12. [Future Enhancements](#future-enhancements)

---

## Project Overview

EFS NASCAR Fantasy League is a web application for managing a 17-team fantasy NASCAR league. Participants pick 3 NASCAR Cup Series drivers per race, with points awarded based on finishing positions and bonus achievements.

### Core Concept
- **17 fantasy teams** compete across the NASCAR Cup Series season
- Each team selects **3 drivers per race**
- Points are awarded based on driver finishing positions (top 10 only)
- Bonus points for stage wins, most laps led, and all-3-in-top-10 finishes
- **Driver usage limits** add strategic depth (4 uses per driver per season + 1 bonus)
- Season culminates in a **playoff format** with elimination rounds

---

## Architecture

### Tech Stack
| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Hosting | Vercel |

### Directory Structure
```
efs-nascar/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, Register, Auth callback
│   │   ├── (dashboard)/      # Main app pages (protected)
│   │   │   ├── page.tsx      # Dashboard home
│   │   │   ├── standings/    # Standings page
│   │   │   ├── picks/        # Pick submission
│   │   │   ├── schedule/     # Race schedule
│   │   │   ├── teams/        # Team list & profiles
│   │   │   └── races/        # Race results viewer
│   │   ├── admin/            # Commissioner panel
│   │   │   ├── seasons/      # Season management
│   │   │   ├── races/        # Race management
│   │   │   ├── drivers/      # Driver management
│   │   │   ├── teams/        # Team & user management
│   │   │   └── results/      # Results entry
│   │   └── api/              # API routes
│   ├── components/           # React components
│   ├── data/                 # Historical NASCAR data
│   │   └── seasons/          # Season-by-season race results
│   ├── lib/                  # Supabase clients
│   └── types/                # TypeScript type definitions
└── supabase/
    └── migrations/           # SQL schema & seed data
```

---

## Database Schema

### Core Tables

#### `profiles`
User profiles linked to Supabase Auth.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (matches auth.users) |
| email | text | User email |
| name | text | Display name |
| is_commissioner | boolean | Admin privileges |

#### `teams`
The 17 fantasy teams in the league.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Team name |
| car_number | integer | Team car number (1-17) |
| logo_url | text | Team logo URL |
| owner_headshot_url | text | Owner photo URL |
| favorite_driver_id | uuid | FK to drivers |
| quote | text | Team motto/quote |
| bio | text | Team description |

#### `team_memberships`
Links users to teams with roles.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to profiles |
| team_id | uuid | FK to teams |
| role | enum | 'member' or 'owner' |

#### `seasons`
NASCAR seasons/years.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| year | integer | Season year (e.g., 2025) |
| name | text | Season name |
| start_date | date | Season start |
| end_date | date | Season end |
| is_active | boolean | Current active season |

#### `tracks`
NASCAR track information.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Full track name |
| short_name | text | Abbreviation |
| location | text | City, State |
| track_type | enum | superspeedway, intermediate, short_track, road_course, street_course, dirt |
| length_miles | decimal | Track length |
| banking_degrees | decimal | Banking angle |
| logo_url | text | Track logo |

#### `races`
Individual races in a season.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| season_id | uuid | FK to seasons |
| race_number | integer | Race order (1-36) |
| name | text | Race name |
| track | text | Track name |
| track_id | uuid | FK to tracks |
| scheduled_datetime | timestamp | Race start time |
| deadline_datetime | timestamp | Pick deadline |
| race_type | enum | regular, playoff_round1, playoff_round2, playoff_finals, exhibition |
| status | enum | upcoming, in_progress, final |

#### `drivers`
NASCAR Cup Series drivers.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Driver full name |
| car_number | integer | Car number |
| team_name | text | NASCAR team (e.g., Hendrick Motorsports) |
| is_active | boolean | Currently competing |

#### `picks`
Team driver selections per race.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| race_id | uuid | FK to races |
| driver_1_id | uuid | First driver pick |
| driver_2_id | uuid | Second driver pick |
| driver_3_id | uuid | Third driver pick |
| submitted_at | timestamp | Submission time |

#### `driver_usage`
Tracks how many times each team has used each driver.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| season_id | uuid | FK to seasons |
| driver_id | uuid | FK to drivers |
| times_used | integer | Usage count |

#### `race_results`
Official race finishing results.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| race_id | uuid | FK to races |
| driver_id | uuid | FK to drivers |
| finish_position | integer | Finishing position |
| stage_1_winner | boolean | Won stage 1 |
| stage_2_winner | boolean | Won stage 2 |
| laps_led | integer | Number of laps led |
| most_laps_led | boolean | Led most laps |

#### `race_scores`
Calculated fantasy scores per team per race.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| race_id | uuid | FK to races |
| driver_1_points | integer | Points from driver 1 |
| driver_2_points | integer | Points from driver 2 |
| driver_3_points | integer | Points from driver 3 |
| stage_bonus | integer | Stage win bonus points |
| laps_led_bonus | integer | Most laps led bonus |
| top_10_bonus | integer | All-3-in-top-10 bonus |
| total_points | integer | Sum of all points |

#### `standings`
Season standings, updated after each race.
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to teams |
| season_id | uuid | FK to seasons |
| race_id | uuid | FK to races (null = season total) |
| total_points | integer | Cumulative points |
| race_wins | integer | Fantasy race wins |
| stage_wins | integer | Stage bonus count |
| top_10_bonuses | integer | All-3-top-10 count |
| rank | integer | Current position |

---

## Scoring System

### Position Points
Only the top 10 finishers score points:

| Position | Points |
|----------|--------|
| 1st | 10 |
| 2nd | 9 |
| 3rd | 8 |
| 4th | 7 |
| 5th | 6 |
| 6th | 5 |
| 7th | 4 |
| 8th | 3 |
| 9th | 2 |
| 10th | 1 |
| 11th+ | 0 |

### Bonus Points
| Bonus | Points | Condition |
|-------|--------|-----------|
| Stage Win | +1 | Any of your 3 drivers wins Stage 1 or Stage 2 |
| Most Laps Led | +1 | Any of your 3 drivers leads the most laps |
| Top 10 Sweep | +1 | All 3 of your drivers finish in the top 10 |

### Maximum Points Per Race
- Best position combo: 10 + 9 + 8 = 27 points
- Maximum bonuses: +2 (stages) + 1 (laps) + 1 (top 10) = +4
- **Theoretical max: 31 points per race**

---

## Driver Usage Rules

### Base Usage
- Each driver can be used **4 times** per season by each team
- Usage is tracked per team, per driver, per season

### Bonus Usage
- Each team receives **1 bonus 5th use** per season
- This can be applied to any driver that has already been used 4 times
- If not earned through the All-Star race, teams receive a default bonus

### Maxed-Out Penalties
- If a team picks a driver who has exceeded their usage limit, that driver scores **0 points**
- The pick still counts against usage

### Strategic Implications
- Teams must strategically manage their top driver picks
- Save usage for important races (playoffs, superspeedways)
- Track competitors' usage to gain advantages

---

## Season Structure

### Regular Season (Races 1-26)
- Standard scoring applies
- Points accumulate toward standings
- Top teams position for playoff seeding

### Playoff Structure (Races 27-36)

#### Round 1 (Races 27-29)
- 6 teams compete
- Bottom team eliminated each race

#### Round 2 (Races 30-32)
- 3 remaining teams
- Bottom team eliminated each race

#### Finals (Races 33-36)
- Championship matchup
- Season champion determined

### Exhibition Race (All-Star)
- Does not count toward standings
- Winner earns bonus driver usage
- Tie-breaker consideration

---

## Playoff System

### Playoff Positions (by rank)
| Rank | Status | Description |
|------|--------|-------------|
| 1-2 | Catbird Seat 🐱 | First round bye |
| 3-6 | Playoff Position | Compete in Round 1 |
| 7 | Lucky Dog 🐶 | Wild card position |
| 8-15 | Consolation | Out of contention |
| 16-17 | Muddy Mile 💩 | Bottom positions |

### Tie-Breakers
1. Most race wins (fantasy wins)
2. Most stage wins picked
3. Most "all 3 in top 10" bonuses
4. All-Star race finish position

---

## User Roles & Permissions

### Team Member
- View schedule, standings, race results
- View own team's picks after deadline
- View other teams' picks after deadline

### Team Owner
- All member permissions
- Submit/edit picks before deadline
- Edit team profile (name, logo, bio)
- Manage team members

### Commissioner
- All owner permissions for all teams
- Enter/finalize race results
- Manage seasons, races, drivers
- Manage teams and user assignments
- Override picks and scores if needed
- System administration

---

## Key Features

### Dashboard
- Current standings snapshot
- Upcoming race with countdown
- Quick access to picks
- Recent announcements
- Team position indicators (Catbird, Lucky Dog, etc.)

### Pick Submission
- Select 3 drivers per race
- Driver usage tracking displayed
- Availability status (available/maxed)
- Deadline countdown
- Lock after deadline

### Standings Page
- Full season standings
- Points breakdown
- Playoff position indicators
- Win/bonus statistics
- Team comparison

### Race Results
- Full finishing order
- Fantasy scores by team
- Pick overlap visualization
- Stage winners and laps led
- Bonus point breakdown

### Schedule
- Full season calendar
- Track types with icons
- Race type indicators
- Pick status per race
- Deadline information

### Team Profiles
- Team information
- Owner details
- Season statistics
- Pick history
- Driver usage chart

---

## Race Data Management

### Current Process (Manual)
1. Commissioner waits for race to complete
2. Accesses Admin → Results page
3. Selects the race from dropdown
4. Manually enters finishing positions (at least top 10)
5. Marks stage winners and most laps led
6. Saves results
7. System automatically:
   - Updates race status to "final"
   - Calculates fantasy scores
   - Updates standings

### Data Requirements for Scoring
To calculate scores, the system needs:
- **Finishing positions** (at minimum top 10)
- **Stage 1 winner**
- **Stage 2 winner**
- **Most laps led** (which driver)

### Historical Data Storage
The `/src/data/seasons/` directory contains TypeScript files with historical race data:
- Used for reference and seeding
- Format: `HistoricalSeason` with nested `HistoricalRace` objects
- Includes full results, stage winners, laps led information

---

## NASCAR API Integration

### Recommended APIs

#### 1. NASCAR Official API (Recommended)
- **Endpoint**: `https://feed.nascar.com/`
- **Documentation**: `https://feed.nascar.com/swagger/ui/index`
- **Data Available**:
  - Live race data
  - Official results
  - Driver/team information
  - Stage results
  - Lap-by-lap data
- **Authentication**: API key required
- **Pros**: Official source, most accurate
- **Cons**: May have rate limits, documentation sparse

#### 2. Sportradar NASCAR v3
- **Endpoint**: `https://api.sportradar.com/nascar/trial/v3/`
- **Documentation**: Available via Sportradar developer portal
- **Data Available**:
  - Race results with positions
  - Stage results
  - Lap counts
  - Driver statistics
- **Authentication**: API key required
- **Pros**: Well-documented, reliable
- **Cons**: Paid service after trial

#### 3. SportsDataIO
- **Endpoint**: `https://api.sportsdata.io/nascar/v2/json/`
- **Data Available**:
  - Race results
  - Driver standings
  - Schedule information
- **Authentication**: API key (free trial available)
- **Pros**: Easy to use, good documentation
- **Cons**: May not have stage-level data

#### 4. Unofficial API (BelNaruto/nascar-api)
- **Repository**: `https://github.com/BelNaruto/nascar-api`
- **Data Available**:
  - Scrapes NASCAR.com data
  - Race results in JSON format
- **Pros**: Free, community-maintained
- **Cons**: Unofficial, may break

### Proposed Integration Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  NASCAR API     │────▶│  Next.js API     │────▶│  Supabase DB    │
│  (External)     │     │  Route Handler   │     │  (race_results) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  Score           │
                        │  Calculator      │
                        └──────────────────┘
```

### Implementation Steps

#### Step 1: Create API Service
```typescript
// src/lib/nascar-api.ts
export async function fetchRaceResults(raceId: string) {
  const response = await fetch(
    `https://feed.nascar.com/rest/cup/race/${raceId}/results`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.NASCAR_API_KEY}`
      }
    }
  );
  return response.json();
}
```

#### Step 2: Create API Route
```typescript
// src/app/api/races/[id]/fetch-results/route.ts
export async function POST(request: Request, { params }) {
  // 1. Fetch results from NASCAR API
  // 2. Transform to our schema
  // 3. Insert into race_results table
  // 4. Trigger score calculation
}
```

#### Step 3: Admin Integration
- Add "Fetch Results" button in admin panel
- One-click import of official results
- Manual override capability preserved

#### Step 4: Automated Polling (Optional)
- Server-side cron job or webhook
- Poll for results after scheduled race time
- Auto-import when race finishes

### Data Mapping

#### NASCAR API Response → Our Schema
```typescript
interface NASCARApiResult {
  position: number;
  driver_id: number;
  driver: {
    full_name: string;
    car_number: string;
  };
  stage1_position: number;
  stage2_position: number;
  laps_led: number;
}

// Transform to:
interface RaceResult {
  race_id: string;
  driver_id: string;  // Look up from our drivers table
  finish_position: number;
  stage_1_winner: boolean;  // position === 1
  stage_2_winner: boolean;  // position === 1
  laps_led: number;
  most_laps_led: boolean;  // max(laps_led) across all drivers
}
```

### Driver Matching Strategy
Since our driver IDs won't match NASCAR's:
1. Match by car number (most reliable)
2. Fallback to fuzzy name matching
3. Manual mapping table for edge cases

---

## Future Enhancements

### Phase 2
- [ ] Playoff bracket visualization
- [ ] Email notifications for deadlines
- [ ] Push notifications (PWA)
- [ ] Historical analytics dashboard
- [ ] Driver performance trends

### Phase 3
- [ ] All-Star draft system
- [ ] Trade/waiver wire system
- [ ] Chat/messaging between teams
- [ ] Mobile app (React Native)
- [ ] Live race tracking

### Phase 4
- [ ] Multi-league support
- [ ] Public league creation
- [ ] Betting/predictions market
- [ ] Advanced statistics
- [ ] AI pick recommendations

---

## Appendix

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
NASCAR_API_KEY=xxx (for automated data fetching)
```

### Key TypeScript Types
See `/src/types/database.ts` for complete type definitions.

### Supabase Migrations
See `/supabase/migrations/` for database schema.

---

*Last Updated: January 2026*
*Version: 1.0*
