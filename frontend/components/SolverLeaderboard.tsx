'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { getSolvers } from '@kova/sdk';
import { formatUnits, isConfigured, kovaConfig, shortAddress } from '@/lib/kova';

export function SolverLeaderboard() {
  const client = useSuiClient();
  const { data: solvers = [], isLoading } = useQuery({
    queryKey: ['solvers', kovaConfig.packageId],
    queryFn: () => getSolvers(client, kovaConfig),
    refetchInterval: 6000,
    enabled: isConfigured,
  });

  if (!isConfigured) {
    return <Empty>Set NEXT_PUBLIC_KOVA_PACKAGE_ID to view solvers.</Empty>;
  }
  if (isLoading) return <Empty>Loading solvers…</Empty>;
  if (solvers.length === 0) return <Empty>No registered solvers yet.</Empty>;

  const ranked = [...solvers].sort((a, b) => Number(b.fillsCompleted - a.fillsCompleted));

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-left text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Solver</th>
            <th className="px-4 py-3 font-medium">Fills</th>
            <th className="px-4 py-3 font-medium">Volume</th>
            <th className="px-4 py-3 font-medium">Stake (SUI)</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((solver) => (
            <tr key={solver.recordId} className="border-t border-zinc-800">
              <td className="px-4 py-3 font-mono text-zinc-300">{shortAddress(solver.solver)}</td>
              <td className="px-4 py-3 text-white">{solver.fillsCompleted.toString()}</td>
              <td className="px-4 py-3 text-zinc-300 tabular-nums">
                {solver.volumeFilled.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-zinc-300">{formatUnits(solver.stake, 9)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
