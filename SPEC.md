# EFS NASCAR Fantasy League - Application Specification

> **Version**: 2.0
> **Last Updated**: January 2026
> **Status**: Production (Active Development)

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Core Features](#core-features)
5. [Scoring System](#scoring-system)
6. [Season Structure](#season-structure)
7. [Driver Analytics](#driver-analytics)
8. [Data Model](#data-model)
9. [API Routes](#api-routes)
10. [User Interface](#user-interface)
11. [External Integrations](#external-integrations)
12. [Development Status](#development-status)
13. [Configuration](#configuration)

---

## Overview

EFS NASCAR Fantasy League is a full-featured web application for managing a 17-team fantasy NASCAR league. The platform replaces manual Google Sheets/Forms workflows with automated scoring, pick submission, standings management, and playoff bracket tracking.

### Key Capabilities

- **Pick Submission**: Teams submit 3 driver picks per race with validation against usage limits
- **Automated Scoring**: Real-time scoring based on race finishes, stage wins, and laps led
- **Driver Analytics**: Weighted scoring system with tier classifications
- **Standings Management**: Live standings with playoff zone indicators
- **Admin Tools**: Comprehensive commissioner panel for league management
- **Historical Data**: Full race data from 2024-2026 seasons

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16 | React framework with App Router |
| React | 19.2.3 | UI library |
| TypeScript | 5 | Type safety |
| Tailwind CSS | 4 | Styling with PostCSS |

### Backend
| Technology | Purpose |
|------------|---------|
| Next.js API Routes | Serverless backend functions |
| Supabase (PostgreSQL) | Database with Row-Level Security |
| Supabase Auth | User authentication |
| Supabase Storage | File storage for team logos |

### External Services
| Service | Purpose |
|---------|---------|
| NASCAR.com API | Race results data |
| Vercel | Hosting platform |

### Development
| Tool | Purpose |
|------|---------|
| ESLint 9 | Code linting |
| Node.js 20+ | Runtime environment |

---

## User Roles & Permissions

### Team Member
- Submit/edit picks before deadline
- View own team's driver usage
- View league standings, picks (after deadline), schedules
- View team profile

### Team Owner
- All Team Member permissions
- Invite/remove team members
- Edit team profile (name, logo, number in offseason)
- Designate other owners

### Commissioner (Admin)
- All Owner permissions for any team
- Confirm/edit race results
- Adjust deadlines (rain delays)
- Post announcements
- Manage season setup (schedule, driver list)
- Override picks/scores if needed
- Manage user accounts
- Access data import/export utilities

---

## Core Features

### 1. Pick Submission System

#### Weekly Flow
1. Race schedule displayed with deadline (noon on race day)
2. Team submits 3 drivers via searchable dropdown
3. System validates against usage limits in real-time
4. Confirmation shown (not visible to others)
5. At deadline: all picks revealed with overlap color coding
6. Submissions locked

#### Pick Visibility
- **Before deadline**: Only your team sees your picks
- **After deadline**: All picks revealed league-wide
- **Color coding**: Green (unique) → Yellow → Red (100% overlap)

#### Validation Rules
- Cannot pick same driver twice in one race
- Cannot exceed driver usage limits (4 base + bonus uses)
- Picks can be edited until deadline
- Picks can be unsubmitted and resubmitted

#### Edge Cases
| Scenario | Behavior |
|----------|----------|
| Missed deadline | 0 points, no usages burned |
| Maxed-out driver picked | 0 points for that slot, usage not burned |
| All 17 teams submitted | Picks revealed early |

### 2. Driver Usage Tracking

#### Base Rules
- Each driver can be used **4 times per season** by default
- One **bonus 5th use** available per season (applies to ONE driver)
- Usage spans entire season (regular + playoffs)

#### Bonus Usage Sources
| Source | Effect |
|--------|--------|
| Default | +1 bonus use |
| Prior consolation bracket win | +1 additional bonus use |
| Prior Bottom-2 battle win | +1 additional bonus use |
| Prior Bottom-2 battle loss | -1 (forfeit 5th use entirely) |

#### Driver Usage Grid
- Heat map showing usage across all teams
- Visual indicators for:
  - Drivers close to max
  - Available vs. exhausted drivers
  - TITS (Tier 1 + Tier 2) remaining stats

### 3. Standings & Rankings

#### Standings Display
- Real-time standings with point totals
- Visual playoff zone groupings:
  - **Catbird Seats** (1-2): Championship bye positions
  - **Playoff** (3-6): Safe playoff spots
  - **Lucky Dog** (7): Wild card position
  - **Consolation** (8-15): Consolation bracket
  - **Muddy Mile** (16-17): Bottom-2 battle

#### Standings Columns
- Position/Rank
- Team name and car number
- Total points
- Race wins picked
- Stage wins picked
- Top 10 bonuses
- Movement indicator

### 4. Team Management

#### Team Profile Fields
| Field | Editability |
|-------|-------------|
| Owner name(s) | Anytime |
| Team name | Anytime |
| Car number | Offseason only (unique league-wide) |
| Team logo | Anytime (any image format) |
| Members | Via email invite |

#### Historical Tracking
- Championships won (by year)
- Consolation wins (by year)
- Bottom-2 results (W/L by year)
- Bonus usage balance
- Season-by-season standings

### 5. Race Management

#### Race Information
- Track name with SVG logos
- Track type classification:
  - Superspeedway
  - Intermediate
  - Short track
  - Road course
  - Street course
  - Dirt
- Scheduled date/time
- Pick deadline
- Race status (upcoming/in_progress/final)

#### Deadline Management
- Default: Noon on race day (race timezone)
- Commissioner can adjust for weather delays
- System logs all deadline changes

---

## Scoring System

### Position Points (Top 10 Finishes)

| Finish Position | Points |
|-----------------|--------|
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
| Stage Win | +1 | Any of your 3 drivers wins a stage |
| Most Laps Led | +1 | Any of your 3 drivers leads most laps |
| Full Speed | +1 | All 3 of your drivers finish top 10 |

### Maximum Weekly Score
- Position points: Up to 27 (10+9+8 with three top-3 finishes)
- Stage wins: Up to 2 (one driver could win both stages)
- Laps led: Up to 1
- Full Speed bonus: Up to 1
- **Theoretical max**: 31 points per race

---

## Season Structure

### Regular Season
- **Start**: Daytona 500
- **Duration**: ~21 races
- **Format**: Weekly pick submission, cumulative points

### All-Star Exhibition (Mid-Season)
- Asynchronous draft format
- 1 driver per team
- Reverse standings draft order
- Time limit per pick (~12-24 hours)
- Scoring: 3/2/1 for 1st/2nd/3rd place picks
- No driver usages burned
- Result serves as 5th tiebreaker

### Playoffs (Final 5 Races)

#### Championship Bracket (Top 7 Teams)

| Round | Races | Teams | Format |
|-------|-------|-------|--------|
| Round 1 | 1 | 7 | 1 eliminated; Top 2 seeds get bye |
| Round 2 | 2 | 6 | 2 eliminated; Points reset |
| Finals | 2 | 4 | Champion crowned; Points reset |

#### Consolation Bracket (Teams 8-15)
- Cumulative scoring across all 5 weeks (no resets)
- Eliminated championship teams join (keep their playoff points)
- **Winner reward**: +1 bonus driver usage for next season

#### Bottom-2 Battle (Teams 16-17)
- Cumulative scoring across all 5 weeks
- **Winner**: +1 bonus usage next season
- **Loser**: Forfeits 5th usage (only 4 uses per driver next season)

### Playoff Qualification Tiebreakers

| Priority | Tiebreaker |
|----------|------------|
| 1 | Most race winners picked |
| 2 | Most stage winners picked |
| 3 | Most "all 3 in top 10" bonuses |
| 4 | Head-to-head record |
| 5 | All-Star race finish position |

### Lucky Dog (7th Spot)
- Most race winners picked among non-top-6 teams
- Acts as wild card into championship bracket

---

## Driver Analytics

### Driver Tier System

Drivers are classified into tiers based on weighted fantasy point performance:

| Tier | Description | Weight |
|------|-------------|--------|
| Tier 1 | Elite performers | Top fantasy scorers |
| Tier 2 | Strong performers | Above average |
| Tier 3 | Average performers | League average |
| Tier 4 | Below average | Lower fantasy output |
| Tier 0 | Part-time drivers | Insufficient races |

### Weighted Scoring Formula

Points are weighted by recency to emphasize current form:

| Period | Races | Weight Multiplier |
|--------|-------|-------------------|
| Recent | Last 30 races | 3x |
| Middle | Races 31-60 | 2x |
| Oldest | Races 61-90 | 1x |

### Driver Ranking Metrics

| Metric | Description |
|--------|-------------|
| Total Points | Raw fantasy points |
| Weighted Score | Points × recency weights |
| Per-Race Score | Weighted score / races run |
| Position Points | Points from finish position only |
| Stage Wins | Total stage wins |
| Laps Led Bonuses | Times leading most laps |
| Average Finish | Mean finishing position |
| Wins | Race victories |
| Top 5s | Top-5 finishes |
| Top 10s | Top-10 finishes |

### Pick Strategy Classification

Teams' pick combinations are classified by "intensity" level:

| Strategy | Tier Mix (T1-T2-T3+) | Description |
|----------|----------------------|-------------|
| Hail Melon | 3-0-0 | Most aggressive |
| All Gas | 2-1-0 or 1-2-0 | Very aggressive |
| Drafting | 0-3-0 | All Tier 2 |
| Saving | 2-0-1 | Aggressive with hedge |
| Gas 'N' Go | 1-1-1 | Balanced |
| Full Fuel | 0-2-1 | Conservative lean |
| 2 Tires | 1-0-2 | Conservative |
| 4 Tires | 0-1-2 | Very conservative |
| 4 Tires & Fuel | 0-0-3 | Most conservative |

### TITS Statistics (Tier 1 + Tier 2)

| Stat | Description |
|------|-------------|
| T1 Remaining | Available Tier 1 driver picks |
| T2 Remaining | Available Tier 2 driver picks |
| TITS Remaining | Total T1 + T2 + bonus uses left |
| TITS % | Percentage of remaining picks that are T1/T2 |

---

## Data Model

### Core Entities

#### profiles
User accounts extending Supabase auth.users
```
id, email, name, avatar_url, created_at
```

#### teams
Fantasy teams with unique car numbers
```
id, name, car_number (unique), logo_url, created_at
```

#### team_memberships
User-to-team assignments with roles
```
user_id, team_id, role (member/owner), invited_at, accepted_at
```

#### seasons
League seasons configuration
```
id, year, start_date, end_date, is_active
```

#### races
Individual race events
```
id, season_id, race_number, name, track_id, scheduled_datetime,
deadline_datetime, is_exhibition, status (upcoming/in_progress/final)
```

#### drivers
NASCAR drivers available for picking
```
id, name, car_number, is_active, api_driver_name (for matching)
```

#### picks
Team submissions per race
```
id, team_id, race_id, driver_1_id, driver_2_id, driver_3_id,
submitted_at, is_valid
```

#### race_results
Official race finish data
```
race_id, driver_id, finish_position, stage_1_winner, stage_2_winner,
laps_led, most_laps_led
```

#### driver_usages
Season usage tracking per team
```
team_id, season_id, driver_id, times_used
```

#### standings (computed/cached)
Team rankings and stats
```
team_id, season_id, race_id, total_points, race_wins, stage_wins,
full_speed_bonuses, rank
```

#### tracks
Track information with visual assets
```
id, name, type, svg_url, city, state
```

#### team_season_bonuses
Bonus usage allocation per season
```
team_id, season_id, bonus_usages
```

#### announcements
Commissioner messages
```
id, author_id, title, body, posted_at
```

#### playoff_brackets
Playoff positioning and status
```
season_id, round, team_id, points, status (active/bye/eliminated)
```

#### all_star_draft
Exhibition draft picks
```
season_id, team_id, driver_id, pick_order, pick_time
```

### Row-Level Security (RLS)
All tables have RLS enabled with appropriate policies for:
- Public read access (standings, results, schedules)
- Team-restricted write access (picks, profiles)
- Admin-only access (race management, user management)

---

## API Routes

### Public Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/standings` | GET | Fetch current standings |
| `/api/races` | GET | Fetch race schedule |
| `/api/drivers` | GET | Fetch active drivers |

### Protected Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/picks` | GET/POST | Submit and retrieve picks |
| `/api/team` | GET/PUT | Team profile management |
| `/api/driver-usages` | GET | Team's driver usage stats |

### Admin Routes
| Route | Method | Description |
|-------|--------|-------------|
| `/api/calculate-scores` | POST | Trigger score calculation |
| `/api/nascar/*` | GET | NASCAR data integration |
| `/api/driver-rankings/*` | GET | Rankings computation |
| `/api/admin/*` | POST | Data maintenance utilities |

---

## User Interface

### Public Routes
| Path | Description |
|------|-------------|
| `/login` | User authentication |
| `/register` | New user registration |
| `/auth/callback` | OAuth callback handler |

### Dashboard Routes (Protected)
| Path | Description |
|------|-------------|
| `/` | Dashboard home with race countdown, standings preview |
| `/standings` | Full standings table with playoff zones |
| `/picks?race={id}` | Pick submission interface |
| `/races/{id}` | Race results and scores |
| `/races/{id}/picks` | All teams' picks (post-deadline) |
| `/schedule` | Full season calendar |
| `/teams` | Team list |
| `/teams/{id}` | Team profile with stats |
| `/teams/{id}/edit` | Team profile editor |
| `/driver-rankings` | Weighted scoring analysis |
| `/driver-usage` | Usage grid heat map |
| `/drivers/{name}` | Individual driver stats |
| `/rules` | League rules reference |

### Admin Routes
| Path | Description |
|------|-------------|
| `/admin` | Commissioner dashboard |
| `/admin/seasons` | Season management |
| `/admin/races` | Race management |
| `/admin/drivers` | Driver management |
| `/admin/teams` | Team/user management |
| `/admin/results` | Manual results entry |
| `/admin/results-import` | Bulk import results |
| `/admin/picks-import` | Import pick data |
| `/admin/fix-data` | Data maintenance utilities |

---

## External Integrations

### NASCAR Data Integration

#### Primary Source: NASCAR Internal JSON API
```
https://cf.nascar.com/cacher/{year}/{series}/{raceId}/results.json
```
- Free, direct from NASCAR
- Undocumented but widely used
- Contains full results, stage winners, laps led

#### Fallback: Web Scraping
- NASCAR.com results pages
- Used when API unavailable

#### Ultimate Fallback: Manual Entry
- Commissioner enters results via admin panel

### Data Flow
1. Race completes
2. System fetches results from NASCAR API
3. Results displayed in admin panel for review
4. Commissioner confirms or edits
5. Scores calculated automatically
6. Standings updated

### Driver Matching
- Drivers stored with `api_driver_name` field
- Handles car number changes mid-season
- Automatic matching on results import
- Manual override available in admin

---

## Development Status

### Completed Features

#### Core Functionality
- [x] User authentication & authorization
- [x] Team profiles with logos
- [x] Pick submission with validation
- [x] Automated scoring calculation
- [x] Real-time standings
- [x] Race schedule management
- [x] Admin panel for commissioners

#### Analytics & Insights
- [x] Driver rankings with weighted scoring
- [x] Driver tier classification
- [x] Pick strategy classification
- [x] TITS statistics
- [x] Individual driver pages
- [x] Driver usage grid/heat map

#### User Experience
- [x] Pick overlap color coding
- [x] Mobile-responsive layouts
- [x] Timezone-aware displays
- [x] Season selector
- [x] Hidden picks until deadline

#### Data Management
- [x] 2024-2026 race data imported
- [x] Track information with SVGs
- [x] NASCAR API integration
- [x] Bulk import utilities

### In Progress
- [ ] Playoff bracket visualization
- [ ] All-Star draft system
- [ ] Email notifications
- [ ] Historical team accolades

### Future Enhancements
- [ ] Live race tracking
- [ ] Chat/comments system
- [ ] PWA mobile experience
- [ ] Public league pages
- [ ] Trade deadline for driver "rights"

---

## Configuration

### Environment
| Setting | Value |
|---------|-------|
| Domain | efsnascar.com |
| Hosting | Vercel |
| Database | Supabase (PostgreSQL) |
| Node.js | 20+ |

### League Settings
| Setting | Value |
|---------|-------|
| Teams | 17 |
| Picks per race | 3 drivers |
| Base driver uses | 4 per season |
| Bonus uses | 1 (default) |
| Pick deadline | Noon race day |

---

## Initial Team Data (2025 Season)

| # | Owner | Team Name |
|---|-------|-----------|
| 1 | Carlock | Sofa King Racing |
| 2 | Anthony | ACRacing |
| 3 | Brace | Brace for Impact |
| 4 | Nick | Pure Pleasure's Pole |
| 5 | Chris | Rock Motorsports |
| 6 | Brad | BMW USA Racing |
| 7 | Jay | Shake-n-Bake |
| 8 | Brian | "The Big One" Brian |
| 9 | Eric | Beamy's Burnouts |
| 10 | Bart | x0x_ChestHair Elliott_x0x |
| 11 | Tyler | High Line Racing |
| 12 | Mark | Lowrie's Left Turns |
| 13 | Ryan | Clean Air Motorsports |
| 14 | Kyle | Cruise Control |
| 15 | Mike | ArMUCKi Motorsports |
| 16 | Doug | Mill$Big High Life Racing |
| 17 | Ninna | Stinned Super Speedway |

---

## Project Structure

```
EFSNascar/
├── SPEC.md                           # This specification document
├── efs-nascar/                       # Main application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/               # Authentication pages
│   │   │   ├── (dashboard)/          # Protected app pages
│   │   │   ├── admin/                # Commissioner panel
│   │   │   └── api/                  # API routes
│   │   ├── components/               # Reusable UI components
│   │   ├── lib/                      # Utility libraries
│   │   │   ├── driverTiers.ts        # Tier calculation
│   │   │   ├── pickStrategy.ts       # Strategy classification
│   │   │   ├── titsCalculation.ts    # TITS stats
│   │   │   ├── nascar-api.ts         # NASCAR data fetching
│   │   │   └── supabase/             # Database clients
│   │   ├── types/                    # TypeScript definitions
│   │   └── data/                     # Static data files
│   ├── supabase/
│   │   └── migrations/               # Database migrations
│   ├── public/                       # Static assets
│   ├── package.json                  # Dependencies
│   └── README.md                     # Setup instructions
```

---

*This specification is a living document and will be updated as features are added or modified.*
