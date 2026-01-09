# EFS NASCAR Fantasy League

A web application to manage a 17-team fantasy NASCAR league with automated scoring, pick submission, standings, and playoff management.

## Features (MVP)

- **Authentication**: User registration and login via Supabase Auth
- **Team Management**: 17 pre-configured fantasy teams with owner assignments
- **Pick Submission**: Select 3 drivers per race with usage tracking
- **Driver Usage Limits**: 4 uses per driver with bonus 5th use system
- **Race Results Entry**: Commissioner enters results with stage winners and laps led
- **Automated Scoring**: Points calculated based on finish positions and bonuses
- **Standings**: Real-time standings with playoff position indicators
- **Admin Panel**: Manage seasons, races, drivers, teams, and results

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth
- **Hosting**: Vercel (recommended)

## Setup Instructions

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the migrations:
   - First run `supabase/migrations/001_initial_schema.sql`
   - Then run `supabase/migrations/002_seed_teams.sql`
3. Get your project URL and anon key from Project Settings > API

### 2. Environment Variables

Create a `.env.local` file in the `efs-nascar` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install Dependencies

```bash
cd efs-nascar
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Create First User & Commissioner

1. Register a new account at `/register`
2. In Supabase Dashboard, go to Table Editor > profiles
3. Find your user and set `is_commissioner` to `true`
4. Now you have admin access to manage the league

## Project Structure

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
│   ├── lib/                  # Supabase clients
│   └── types/                # TypeScript types
└── supabase/
    └── migrations/           # SQL schema & seed data
```

## Scoring System

### Position Points (Top 10)
| Position | Points |
|----------|--------|
| 1st | 10 |
| 2nd | 9 |
| 3rd | 8 |
| ... | ... |
| 10th | 1 |
| 11th+ | 0 |

### Bonus Points
- Stage win (by any of your 3 drivers): +1
- Most laps led (by any of your 3 drivers): +1
- All 3 drivers finish top 10: +1

### Driver Usage
- Base: 4 uses per driver per season
- Bonus: 1 additional 5th use (earned or default)
- Maxed-out driver picks score 0 points

## User Roles

### Team Member
- Submit/edit picks before deadline
- View standings, picks, schedules

### Team Owner
- All member permissions
- Edit team profile
- Manage team members

### Commissioner
- All permissions
- Enter/confirm race results
- Manage seasons, races, drivers
- Override picks/scores
- Manage user accounts

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project to Vercel
3. Add environment variables
4. Deploy

### Other Platforms

The app is a standard Next.js application and can be deployed to any platform that supports Node.js.

## Development Notes

- Row-Level Security (RLS) is enabled on all tables
- Picks are hidden until deadline passes
- Commissioner approval required for results
- Standings update automatically after scoring

## Future Enhancements (Phase 2+)

- Playoff bracket visualization
- All-Star draft system
- Email notifications
- Historical data & analytics
- Mobile PWA

## License

Private - EFS NASCAR Fantasy League
