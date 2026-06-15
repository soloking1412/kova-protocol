'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { getProtocolStats } from '@kova/sdk';
import { formatUnits, isConfigured, kovaConfig } from '@/lib/kova';

export function ProtocolStats() {
  const client = useSuiClient();
  const { data } = useQuery({
    queryKey: ['stats', kovaConfig.packageId],
    queryFn: () => getProtocolStats(client, kovaConfig),
    refetchInterval: 6000,
    enabled: isConfigured,
  });

  const stats = [
    { label: 'Solvers', value: data ? data.solvers.toString() : '—' },
    { label: 'Total staked', value: data ? `${formatUnits(data.totalStake, 9)} SUI` : '—' },
    { label: 'Fills settled', value: data ? data.totalFills.toString() : '—' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-center">
          <div className="text-xl font-semibold text-white tabular-nums">{s.value}</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
