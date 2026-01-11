# Driver Matching Bug: Car Number vs Name-First Matching

## Issue Summary

**Status**: Bug
**Priority**: High
**Affects**: Driver rankings, points calculations, historical data integrity

### Problem Statement

Race results are being incorrectly attributed when drivers change car numbers between seasons. Shane van Gisbergen (SVG) serves as the primary example:

- **2024 Season**: SVG drove car #88
- **2025 Season**: SVG drives car #16

When the system matches race results by car number first, it assigns results to whoever currently has that car number in the database, causing:
1. SVG's wins showing correctly on individual race pages
2. SVG's total points showing only 5 points on the driver rankings page
3. Historical results potentially misattributed to wrong drivers

---

## Technical Analysis

### Current Data Flow

```
NASCAR API → fetch-results → race_results table → driver_rankings calculation
                  ↓
           Driver matching logic
           (matches by car number or name)
```

### Root Cause

The `race_results` table stores `driver_id` (foreign key to `drivers` table), not the original driver name from the API. Once a result is linked to the wrong `driver_id`, the original driver identity is lost.

**Database Schema**:
```sql
race_results (
  id uuid PRIMARY KEY,
  race_id uuid,
  driver_id uuid,  -- FK to drivers, NOT the original name
  finish_position integer,
  stage_1_winner boolean,
  stage_2_winner boolean,
  most_laps_led boolean
)
```

### The Car Number Problem

Multiple drivers share the same car numbers across different seasons:

| Car # | 2024 Driver | 2025 Driver |
|-------|-------------|-------------|
| 16 | AJ Allmendinger | Shane van Gisbergen |
| 88 | Shane van Gisbergen | (various) |
| 77 | Carson Hocevar | Carson Hocevar |

When results are imported with car-number-first matching:
- A P1 finish for SVG (#16 in 2025) gets correctly linked
- But if the `drivers` table has multiple #16 entries, the wrong one might be selected

### Duplicate Driver Records

If the same driver exists with different car numbers (two records for SVG - one with #88, one with #16), the driver rankings calculate points separately for each record, fragmenting their results.

---

## Evidence

### Screenshots Analysis

**Race Detail Page (Watkins Glen, August 2025)**:
- Shows: `Winner: #16 Shane van Gisbergen`
- Shows: `Most Laps Led: #16 Shane van Gisbergen`
- Expected points: 10 (P1) + 1 (ML) = 11 points

**Driver Rankings Page**:
- Shows: `#16 Shane van Gisbergen` with only **5 points** across **5 races**
- Position: 39th

This discrepancy proves that:
1. Race results are correctly linked for the 2025 Watkins Glen race
2. But driver rankings are showing aggregated data from a different source/calculation
3. Likely cause: duplicate driver records or mislinked historical results

---

## Current Matching Logic

### Location: `/src/app/api/nascar/fetch-results/route.ts`

The current implementation uses name-first matching:

```typescript
const findDriver = (apiName: string, carNumber: number): Driver | null => {
  // 1. Try exact name match (case-insensitive)
  const exactMatch = driverByExactName.get(apiName.toLowerCase());
  if (exactMatch) return exactMatch;

  // 2. Try normalized name match (removes punctuation)
  const normalizedMatch = driverByNormalizedName.get(normalizeName(apiName));
  if (normalizedMatch) return normalizedMatch;

  // 3. Try last name match (if unique)
  const lastName = getLastName(apiName);
  const lastNameMatches = driverByLastName.get(lastName);
  if (lastNameMatches?.length === 1) return lastNameMatches[0];

  // 4. Try last name + car number combo (if multiple last names)
  if (lastNameMatches?.length > 1) {
    const carMatch = lastNameMatches.find(d => d.car_number === carNumber);
    if (carMatch) return carMatch;
  }

  // 5. FALLBACK: Car number only (problematic!)
  const carNumberMatch = driverByCarNumber.get(carNumber);
  if (carNumberMatch) return carNumberMatch;

  return null;
};
```

**Issue**: The fallback to car number matching (step 5) can still cause mismatches when:
- Driver names don't match exactly (typos, formatting differences)
- New drivers not yet in our database

---

## Fix-Results Endpoint Problem

### Location: `/src/app/api/admin/fix-results-by-name/route.ts`

**Current Logic (Flawed)**:
```typescript
// Gets current driver info from result's driver_id
const currentDriver = result.driver as any;

// Tries to find "correct" driver by looking up currentDriver.name
const correctDriver = findDriverByName(currentDriver.name, currentDriver.car_number);
```

**Problem**: If a result is linked to the wrong driver (e.g., Driver A instead of SVG), the fix endpoint looks up Driver A's name and "correctly" finds Driver A. It can never discover that the result should belong to SVG because the original driver name was never stored.

---

## Proposed Solution

### Phase 1: Add Original Driver Name Storage

**Schema Change**:
```sql
ALTER TABLE race_results ADD COLUMN api_driver_name text;
ALTER TABLE race_results ADD COLUMN api_car_number integer;
```

This preserves the original API data for re-matching.

### Phase 2: Create Driver Deduplication Tool

**New Endpoint**: `/api/admin/merge-drivers`

```typescript
// Merge two driver records (e.g., #88 SVG and #16 SVG)
interface MergeDriversRequest {
  keep_driver_id: string;    // The driver record to keep
  merge_driver_id: string;   // The driver record to merge into the kept one
  update_car_number?: number; // Optionally update car number on kept record
}

// Actions:
// 1. Update all race_results.driver_id from merge_id to keep_id
// 2. Update all picks referencing merge_id to keep_id
// 3. Update driver_usage records
// 4. Delete the merged driver record
```

### Phase 3: Re-import with Name Matching

**Process**:
1. Store original API name/car# when importing
2. Run diagnostic to find mismatches
3. Re-link results using name-first matching
4. Merge duplicate driver records

### Phase 4: Update Driver Record Management

**When driver changes car numbers**:
1. Update the existing driver record's `car_number` field
2. Do NOT create a new driver record
3. Historical results remain linked to the same `driver_id`

---

## Implementation Steps

### Step 1: Diagnostic Query

Create endpoint to identify potential duplicate drivers:

```typescript
// Find drivers with similar names
const duplicates = drivers.filter(d1 =>
  drivers.some(d2 =>
    d1.id !== d2.id &&
    normalizeName(d1.name) === normalizeName(d2.name)
  )
);

// Find results that might be mislinked
const suspiciousResults = results.filter(r => {
  const linkedDriver = getDriver(r.driver_id);
  const raceDate = getRace(r.race_id).scheduled_datetime;
  // Check if driver had this car number at race time
});
```

### Step 2: Add `api_driver_name` Column

Migration:
```sql
ALTER TABLE race_results
ADD COLUMN api_driver_name text,
ADD COLUMN api_car_number integer;
```

### Step 3: Update Import Logic

Modify `/api/nascar/fetch-results`:
```typescript
// Store original API data alongside driver_id
await supabase.from('race_results').insert({
  race_id: raceId,
  driver_id: matchedDriver.id,
  api_driver_name: apiResult.driver.full_name,  // NEW
  api_car_number: apiResult.driver.car_number,  // NEW
  finish_position: apiResult.position,
  // ... rest
});
```

### Step 4: Create Merge Drivers Tool

Admin UI page: `/admin/drivers/merge`

Features:
- Select two driver records to merge
- Preview what will change (results count, picks count)
- Confirm and execute merge
- Audit log of merge action

### Step 5: Fix Existing Data

1. Run diagnostic to identify SVG's multiple records
2. Merge #88 SVG into #16 SVG
3. Update #16 SVG's car_number history (or add car_number_history JSON field)
4. Verify driver rankings now show correct totals

---

## Driver Car Number History

**Enhanced Schema Proposal**:

```sql
-- Track car number changes over time
CREATE TABLE driver_car_history (
  id uuid PRIMARY KEY,
  driver_id uuid REFERENCES drivers(id),
  car_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date,  -- NULL = current
  team_name text,
  created_at timestamp DEFAULT now()
);

-- Add index for efficient lookups
CREATE INDEX idx_driver_car_history_lookup
ON driver_car_history(driver_id, start_date, end_date);
```

**Matching Logic Update**:
```typescript
// Find driver by name + car number at a specific date
const findDriverAtDate = (name: string, carNumber: number, raceDate: Date) => {
  // 1. Name match (always preferred)
  const nameMatch = findByName(name);
  if (nameMatch) return nameMatch;

  // 2. Car number + date lookup
  const carHistory = await supabase
    .from('driver_car_history')
    .select('driver_id')
    .eq('car_number', carNumber)
    .lte('start_date', raceDate)
    .or(`end_date.is.null,end_date.gte.${raceDate}`)
    .single();

  return carHistory?.driver_id;
};
```

---

## Immediate Fix (Short Term)

While the full solution is implemented, manually fix SVG's records:

1. **Identify SVG's driver records**:
   ```sql
   SELECT * FROM drivers WHERE name ILIKE '%gisbergen%';
   ```

2. **Find results linked to wrong driver**:
   ```sql
   SELECT r.*, d.name, d.car_number, race.name as race_name
   FROM race_results r
   JOIN drivers d ON r.driver_id = d.id
   JOIN races race ON r.race_id = race.id
   WHERE d.name ILIKE '%gisbergen%'
   ORDER BY race.scheduled_datetime;
   ```

3. **Update results to correct driver_id**:
   ```sql
   UPDATE race_results
   SET driver_id = '<correct_svg_id>'
   WHERE driver_id = '<wrong_svg_id>';
   ```

4. **Delete duplicate driver record**:
   ```sql
   DELETE FROM drivers WHERE id = '<wrong_svg_id>';
   ```

---

## Testing Plan

### Unit Tests

1. Name matching with various formats:
   - "Shane van Gisbergen"
   - "Shane Van Gisbergen"
   - "S. van Gisbergen"

2. Car number matching fallback:
   - Unknown driver with known car number
   - Known driver with changed car number

3. Driver merge operation:
   - Results correctly transferred
   - Picks correctly updated
   - No orphaned references

### Integration Tests

1. Import race results for driver who changed car numbers
2. Verify driver rankings aggregate correctly
3. Verify race detail pages show correct driver info

### Manual QA

1. Import Watkins Glen 2025 results
2. Check SVG appears correctly on race page
3. Check SVG's total points on driver rankings
4. Verify points math is correct

---

## Related Files

| File | Purpose |
|------|---------|
| `/src/app/api/nascar/fetch-results/route.ts` | Import race results |
| `/src/app/api/nascar/bulk-import/route.ts` | Bulk import winners |
| `/src/app/api/admin/fix-results-by-name/route.ts` | Fix mislinked results |
| `/src/app/api/admin/fix-driver-links/route.ts` | Fix orphaned driver IDs |
| `/src/app/api/admin/fix-car-number-conflicts/route.ts` | Diagnose car # conflicts |
| `/src/app/(dashboard)/driver-rankings/page.tsx` | Driver rankings display |
| `/src/app/api/driver-rankings/route.ts` | Driver rankings calculation |

---

## Success Criteria

1. SVG shows correct total points on driver rankings page
2. All historical wins attributed to correct driver
3. No duplicate driver records in database
4. Import process handles car number changes automatically
5. Admin can easily merge duplicate drivers when discovered

---

*Created: January 2026*
*Author: Claude*
*Related Issue: SVG #16/#88 car number change causing points discrepancy*
