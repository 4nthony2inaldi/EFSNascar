// Pick Strategy Utility
// Classifies team picks based on driver tier distribution

export interface PickDistribution {
  t1: number;  // Tier 1 drivers
  t2: number;  // Tier 2 drivers
  t3plus: number;  // Tier 3+ drivers
}

export interface PickStrategy {
  label: string;
  intensity: number;  // 1-9 scale (1 = most aggressive, 9 = most conservative)
  distribution: PickDistribution;
  color: string;  // Tailwind color class for badge
  textColor: string;  // Tailwind text color class
}

// Maps distribution pattern (t1-t2-t3+) to strategy
// Sorted by intensity (most aggressive to most conservative)
const STRATEGY_MAP: Record<string, Omit<PickStrategy, 'distribution'>> = {
  // All top tier picks = maximum aggression
  '3-0-0': { label: 'Hail Melon', intensity: 1, color: 'bg-red-600', textColor: 'text-white' },

  // Heavy on T1/T2, no T3+
  '2-1-0': { label: 'All Gas', intensity: 2, color: 'bg-orange-500', textColor: 'text-black' },
  '1-2-0': { label: 'All Gas', intensity: 2, color: 'bg-orange-500', textColor: 'text-black' },

  // All T2 picks
  '0-3-0': { label: 'Drafting', intensity: 3, color: 'bg-amber-500', textColor: 'text-black' },

  // T1 heavy with some T3+
  '2-0-1': { label: 'Saving', intensity: 4, color: 'bg-yellow-400', textColor: 'text-black' },

  // Balanced across all tiers
  '1-1-1': { label: "Gas 'N' Go", intensity: 5, color: 'bg-lime-500', textColor: 'text-black' },

  // T2 heavy with some T3+
  '0-2-1': { label: 'Full Fuel', intensity: 6, color: 'bg-emerald-500', textColor: 'text-black' },

  // T3+ heavy with some top tier
  '1-0-2': { label: '2 Tires', intensity: 7, color: 'bg-cyan-500', textColor: 'text-black' },
  '0-1-2': { label: '4 Tires', intensity: 8, color: 'bg-blue-500', textColor: 'text-white' },

  // All T3+ picks = maximum conservation
  '0-0-3': { label: '4 Tires & Fuel', intensity: 9, color: 'bg-purple-600', textColor: 'text-white' },
};

// Get strategy key from distribution
function getStrategyKey(distribution: PickDistribution): string {
  return `${distribution.t1}-${distribution.t2}-${distribution.t3plus}`;
}

// Calculate tier distribution from driver tiers
export function calculateDistribution(driverTiers: number[]): PickDistribution {
  let t1 = 0;
  let t2 = 0;
  let t3plus = 0;

  for (const tier of driverTiers) {
    if (tier === 1) {
      t1++;
    } else if (tier === 2) {
      t2++;
    } else {
      // Tier 3+ or 0 (part-time) counts as T3+
      t3plus++;
    }
  }

  return { t1, t2, t3plus };
}

// Get pick strategy from driver tiers
export function getPickStrategy(driverTiers: number[]): PickStrategy {
  const distribution = calculateDistribution(driverTiers);
  const key = getStrategyKey(distribution);

  const strategy = STRATEGY_MAP[key];

  if (strategy) {
    return {
      ...strategy,
      distribution,
    };
  }

  // Fallback for any unexpected combinations
  return {
    label: 'Custom',
    intensity: 5,
    color: 'bg-gray-500',
    textColor: 'text-white',
    distribution,
  };
}

// Get all strategies sorted by intensity (for legend)
export function getAllStrategies(): PickStrategy[] {
  const strategies: PickStrategy[] = [];
  const seenLabels = new Set<string>();

  // Process in order of intensity
  const sortedEntries = Object.entries(STRATEGY_MAP).sort(
    (a, b) => a[1].intensity - b[1].intensity
  );

  for (const [key, strategy] of sortedEntries) {
    // Only include unique labels for legend
    if (!seenLabels.has(strategy.label)) {
      seenLabels.add(strategy.label);
      const [t1, t2, t3plus] = key.split('-').map(Number);
      strategies.push({
        ...strategy,
        distribution: { t1, t2, t3plus },
      });
    }
  }

  return strategies;
}

// Get intensity color (for a numeric indicator)
export function getIntensityGradient(intensity: number): string {
  // Creates gradient from red (1) to purple (9)
  switch (intensity) {
    case 1: return 'bg-gradient-to-r from-red-600 to-red-500';
    case 2: return 'bg-gradient-to-r from-orange-500 to-orange-400';
    case 3: return 'bg-gradient-to-r from-amber-500 to-amber-400';
    case 4: return 'bg-gradient-to-r from-yellow-500 to-yellow-400';
    case 5: return 'bg-gradient-to-r from-lime-500 to-lime-400';
    case 6: return 'bg-gradient-to-r from-emerald-500 to-emerald-400';
    case 7: return 'bg-gradient-to-r from-cyan-500 to-cyan-400';
    case 8: return 'bg-gradient-to-r from-blue-500 to-blue-400';
    case 9: return 'bg-gradient-to-r from-purple-600 to-purple-500';
    default: return 'bg-gray-500';
  }
}
