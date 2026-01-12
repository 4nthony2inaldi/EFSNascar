'use client';

import { type PickStrategy, type PickDistribution, getAllStrategies } from '@/lib/pickStrategy';

interface PickStrategyBadgeProps {
  strategy: PickStrategy;
  showDistribution?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PickStrategyBadge({
  strategy,
  showDistribution = false,
  size = 'md',
}: PickStrategyBadgeProps) {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded ${strategy.color} ${strategy.textColor} ${sizeClasses[size]}`}
      title={`Tier Distribution: T1=${strategy.distribution.t1}, T2=${strategy.distribution.t2}, T3+=${strategy.distribution.t3plus}`}
    >
      <span>{strategy.label}</span>
      {showDistribution && (
        <span className="opacity-75 text-[0.85em]">
          ({strategy.distribution.t1}-{strategy.distribution.t2}-{strategy.distribution.t3plus})
        </span>
      )}
    </span>
  );
}

interface PickStrategyLegendProps {
  compact?: boolean;
}

export function PickStrategyLegend({ compact = false }: PickStrategyLegendProps) {
  const strategies = getAllStrategies();

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {strategies.map((strategy) => (
          <PickStrategyBadge
            key={strategy.label}
            strategy={strategy}
            size="sm"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-3 sm:p-6">
      <h2 className="text-sm sm:text-lg font-bold text-white mb-2 sm:mb-4">Pick Strategy</h2>
      <p className="text-purple-400 text-xs sm:text-sm mb-3">
        Strategy based on driver tier distribution (T1-T2-T3+). Lower intensity = more aggressive.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-purple-400 border-b border-purple-700/30">
              <th className="pb-2 pr-4">Label</th>
              <th className="pb-2 pr-2 text-center">T1</th>
              <th className="pb-2 pr-2 text-center">T2</th>
              <th className="pb-2 pr-2 text-center">T3+</th>
              <th className="pb-2 text-center">Risk</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map((strategy) => (
              <tr key={strategy.label} className="border-b border-purple-800/20">
                <td className="py-2 pr-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded font-semibold ${strategy.color} ${strategy.textColor}`}
                  >
                    {strategy.label}
                  </span>
                </td>
                <td className="py-2 pr-2 text-center text-amber-400 font-bold">
                  {strategy.distribution.t1}
                </td>
                <td className="py-2 pr-2 text-center text-emerald-400 font-bold">
                  {strategy.distribution.t2}
                </td>
                <td className="py-2 pr-2 text-center text-cyan-400 font-bold">
                  {strategy.distribution.t3plus}
                </td>
                <td className="py-2 text-center">
                  <span className="text-purple-300">{strategy.intensity}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Distribution breakdown component
interface DistributionBreakdownProps {
  distribution: PickDistribution;
}

export function DistributionBreakdown({ distribution }: DistributionBreakdownProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 rounded bg-amber-500 text-black flex items-center justify-center font-bold text-[10px]">
          {distribution.t1}
        </span>
        <span className="text-amber-400">T1</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 rounded bg-emerald-500 text-black flex items-center justify-center font-bold text-[10px]">
          {distribution.t2}
        </span>
        <span className="text-emerald-400">T2</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="w-4 h-4 rounded bg-cyan-500 text-black flex items-center justify-center font-bold text-[10px]">
          {distribution.t3plus}
        </span>
        <span className="text-cyan-400">T3+</span>
      </span>
    </div>
  );
}
