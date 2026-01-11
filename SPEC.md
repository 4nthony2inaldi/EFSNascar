# EFS NASCAR Fantasy League - App Specification

## Overview
A web application to manage a 17-team fantasy NASCAR league, replacing manual Google Sheets/Forms workflows with automated scoring, pick submission, standings, and playoff management.

---

## User Roles & Permissions

### Team Member
- Submit/edit picks before deadline
- View own team's driver usage
- View league standings, picks (after deadline), schedules
- Manage team profile (with owner approval)

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

---

## Team Profile

| Field | Rules |
|-------|-------|
| Owner name(s) | Editable anytime |
| Team name | Editable anytime |
| Car number | Unique league-wide, editable only in offseason |
| Team logo | Upload anytime, any format |
| Members | Email-based invites, multiple per team |

### Historical Tracking (per team)
- Championships won (years)
- Consolation wins (years)
- Bottom-2 results (W/L by year)
- Bonus usage balance (calculated from history)
- Season-by-season standings

---

## Season Structure

### Regular Season
- Starts: Daytona 500
- Ends: Race before playoffs (~21 races)
- Weekly: Pick 3 drivers, score based on performance

### All-Star Exhibition (mid-season)
- Async draft, 1 driver per team
- Reverse standings draft order
- Time limit per pick (~12-24 hours)
- Scoring: 3/2/1 for 1st/2nd/3rd place picks
- No driver usages burned
- Result = 5th tiebreaker

### Playoffs (Final 5 Races)

**Championship Bracket (Top 7)**
| Round | Races | Teams | Elimination | Notes |
|-------|-------|-------|-------------|-------|
| Round 1 | 1 | 7 | 1 eliminated | Top 2 seeds get bye (don't use drivers) |
| Round 2 | 2 | 6 | 2 eliminated | Points reset |
| Finals | 2 | 4 | Crown champion | Points reset |

**Consolation Bracket**
- Teams 8-15 at playoff start
- Eliminated championship teams join (keep their playoff points)
- Cumulative scoring across all 5 weeks (no resets)
- Winner earns +1 bonus driver usage for next season

**Bottom 2 Battle**
- Teams 16-17
- Cumulative scoring across all 5 weeks
- Winner: +1 bonus usage next season
- Loser: Forfeits 5th usage (only 4 uses per driver next season)

---

## Scoring System

### Weekly Points (Top 10 Finishes)
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
- Stage win (by any of your 3 drivers): +1
- Most laps led (by any of your 3 drivers): +1
- All 3 drivers finish top 10: +1

### Driver Usage Rules
- Base: 4 uses per driver per season
- Bonus: 1 additional 5th use on any ONE driver (default)
- Bonus stacks from prior season consolation/bottom-2 wins
- Penalty: Bottom-2 loser forfeits 5th use next season
- Picking a maxed-out driver = 0 points for that driver slot
- Usage limits span entire season (regular + all postseason tracks)

---

## Playoff Qualification

### Top 6: Points leaders
### 7th Spot (Lucky Dog): Most race winners picked among non-top-6 teams

### Tiebreakers (in order)
1. Most race winners picked
2. Most stage winners picked
3. Most "all 3 in top 10" bonuses
4. (Implicit: head-to-head not mentioned)
5. All-Star race finish position

---

## Driver Rankings & Analytics

### Weighted Scoring System
The driver rankings page uses a weighted scoring system to emphasize recent performance:

| Tier | Races | Weight |
|------|-------|--------|
| Recent | Last 30 races | 3x |
| Middle | Races 31-60 | 2x |
| Oldest | Races 61-90 | 1x |

### Metrics Displayed
- **Total Points**: Raw fantasy points (position + stage wins + laps led bonuses)
- **Weighted Score**: Points multiplied by recency weights
- **Per-Race Score**: Weighted score / races run (identifies efficient performers)
- **Position Points**: Points from finish position only
- **Stage Wins**: Total stage wins
- **Laps Led Bonuses**: Times driver led most laps
- **Average Finish**: Mean finishing position
- **Wins / Top 5s / Top 10s**: Race result statistics

---

## Pick Submission

### Weekly Flow
1. Race schedule shown with deadline (noon on race day)
2. Team submits 3 drivers
3. System validates against usage limits
4. System shows confirmation (not visible to others yet)
5. At deadline OR when all 17 teams submit:
   - Picks revealed to everyone
   - Color-coded by pick overlap (green=unique → red=100%)
6. Submissions locked

### Missed Deadline
- Team receives 0 points for the week
- No driver usages burned

### Invalid Pick (maxed driver)
- That driver slot scores 0
- Usage is NOT burned (already maxed)

---

## Race Results Entry

### Hybrid Flow
1. After race completion, system fetches suggested results (API/scrape from NASCAR.com or similar)
2. Commissioner reviews: finish order, stage winners, most laps led
3. Commissioner confirms or edits
4. System calculates all team scores automatically
5. Standings update

### Deadline Adjustments
- Commissioner can shift deadline if race postponed (weather)
- System logs all deadline changes

---

## Data Model (Core Entities)

### Users
- id, email, password_hash, name, created_at

### Teams
- id, name, car_number (unique), logo_url, created_at

### Team_Memberships
- user_id, team_id, role (member/owner), invited_at, accepted_at

### Seasons
- id, year, start_date, end_date, is_active

### Team_Season_Bonuses
- team_id, season_id, bonus_usages (calculated from history)

### Races
- id, season_id, race_number, name, track, scheduled_datetime, deadline_datetime, is_exhibition, status (upcoming/in_progress/final)

### Drivers
- id, name, car_number, is_active

### Race_Results
- race_id, driver_id, finish_position, stage_1_winner, stage_2_winner, laps_led, most_laps_led

### Picks
- id, team_id, race_id, driver_1_id, driver_2_id, driver_3_id, submitted_at, is_valid

### Driver_Usages
- team_id, season_id, driver_id, times_used

### Standings (computed/cached)
- team_id, season_id, race_id, total_points, race_wins, stage_wins, full_speed_bonuses, rank

### Playoff_Brackets
- season_id, round, team_id, points, status (active/bye/eliminated)

### Announcements
- id, author_id, title, body, posted_at

### All_Star_Draft
- season_id, team_id, driver_id, pick_order, pick_time

---

## Key Screens

### Public/Pre-Login
- Login / Register
- Password reset

### Main Dashboard
- Current race countdown & deadline
- Quick pick submission (if not submitted)
- Standings snapshot
- Recent announcements

### Standings Page
- Full standings table with all stats
- Visual groupings (playoff spots, bubble, etc.)
- Filter by: regular season / playoffs / consolation
- Movement indicators

### Pick Submission
- Driver search/select (3 slots)
- Usage indicators per driver (X/4 used, 5th available?)
- Validation warnings
- Submit button
- Confirmation state

### Race Results (per race)
- All teams' picks (color-coded overlap)
- Race results with points breakdown
- Stage winners, most laps led
- Points earned per team

### Playoffs Bracket
- Visual bracket (like your 2024 image)
- Championship, Consolation, Bottom-2 sections
- Auto-updates as eliminations happen

### All-Star Draft
- Draft order queue
- Available drivers
- Pick clock/timer
- Completed picks list

### Team Profile
- Edit team info (name, logo, number in offseason)
- Manage members
- View team history & accolades

### Driver Usage Grid
- Heat map: drivers × teams
- Season totals
- Who's close to max

### Driver Rankings
- Sortable table of all drivers
- Weighted and raw fantasy point totals
- Per-race efficiency scoring
- Win/Top 5/Top 10 statistics
- Color-coded average finish indicators

### Admin Panel
- Enter/confirm race results
- Adjust deadlines
- Post announcements
- Manage teams/users
- Season setup

### Schedule
- Full season calendar
- Race times, tracks
- Deadline times

---

## Notifications

### Email Triggers
- Pick deadline reminder (24h, 2h before)
- Your turn in All-Star draft
- Race results finalized
- Playoff elimination/advancement
- Announcement posted

### In-App
- Unsubmitted pick warning
- New announcements badge

---

## Technical Recommendations

### Stack
- **Frontend**: Next.js (React) + TypeScript + Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL (via Supabase or similar)
- **Auth**: Supabase Auth or NextAuth.js
- **File Storage**: Supabase Storage (logos)
- **Notifications**: Resend (email) or similar
- **Hosting**: Vercel

### External Data
- NASCAR results: Scrape from NASCAR.com or use unofficial API
- Consider manual fallback if scraping breaks

### Mobile
- Responsive design (mobile-first)
- PWA capabilities for "app-like" feel

---

## MVP vs Future

### MVP (Phase 1)
- User auth & team profiles
- Season/race schedule management
- Pick submission with validation
- Manual race results entry
- Automated scoring
- Standings page
- Basic admin panel

### Phase 2
- Playoffs bracket visualization
- All-Star draft system
- Pick overlap color coding
- Email notifications
- Hybrid results entry (suggested + confirm)

### Phase 3
- Historical season data
- Team history & accolades
- Announcements system
- Mobile PWA

### Implemented Features (Current State)
- Driver Rankings page with weighted scoring system
- Pick overlap/popularity color coding (green-yellow-red gradient)
- 2024-2026 historical race data imported
- Complete race schedules with track information

### Future Ideas
- Live race tracking
- Chat/comments
- Trade deadline for driver "rights"?
- Public league pages (if you want to share)

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

## NASCAR Data Integration

### Recommended Approach: Hybrid with Admin Confirmation

**Primary Source**: NASCAR's internal JSON API
- Endpoint pattern: `https://cf.nascar.com/cacher/{year}/{series}/{raceId}/results.json`
- Free, direct from NASCAR
- Undocumented but widely used by fan projects

**Fallback**: Web scraping from NASCAR.com results pages

**Ultimate Fallback**: Manual admin entry

### Data Flow
1. Race completes
2. App fetches results from NASCAR API (or scrapes if API fails)
3. Results displayed in admin panel for review
4. Commissioner confirms or edits
5. Scores calculated and standings updated

### Data Points Needed Per Race
- Finish positions (1-40+)
- Stage 1 winner
- Stage 2 winner
- Most laps led
- (Driver list for the season)

---

## Configuration

- **Domain**: efsnascar.com
- **Hosting**: Vercel (free tier)
- **Database**: Supabase (free tier)
- **Initial Timeline**: MVP launched before Daytona 500 2025
- **Current Status**: Active development with 2024-2026 race data

---

## Development Progress

### Completed
1. Next.js project initialized with Supabase Auth
2. Database schema implemented with all core tables
3. MVP features: picks, scoring, standings
4. Race schedule and results management
5. Admin panel for commissioners
6. Driver rankings with weighted scoring
7. Pick popularity color coding
8. 2024-2026 race data imported

### In Progress / Next
1. Playoff bracket visualization
2. All-Star draft system
3. Email notifications
4. Historical team accolades tracking
