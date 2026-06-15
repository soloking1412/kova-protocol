'use client';

import { useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildDeregisterSolverTx,
  buildRegisterSolverTx,
  getSolvers,
  MIN_STAKE_MIST,
} from '@kova/sdk';
import { formatUnits, isConfigured, kovaConfig, parseUnits, registryId } from '@/lib/kova';

export function BecomeSolver() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useSignAndExecuteTransaction();

  const [stake, setStake] = useState('1');
  const [status, setStatus] = useState<string | null>(null);

  const { data: solvers = [] } = useQuery({
    queryKey: ['solvers', kovaConfig.packageId],
    queryFn: () => getSolvers(client, kovaConfig),
    refetchInterval: 6000,
    enabled: isConfigured,
  });

  const myRecord = account
    ? solvers.find((s) => s.solver.toLowerCase() === account.address.toLowerCase())
    : undefined;

  const ready = isConfigured && registryId !== '';

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['solvers', kovaConfig.packageId] });
    queryClient.invalidateQueries({ queryKey: ['stats', kovaConfig.packageId] });
  }

  function register() {
    if (!account) return;
    const stakeMist = parseUnits(stake, 9);
    if (stakeMist < MIN_STAKE_MIST) {
      setStatus('Minimum stake is 1 SUI.');
      return;
    }
    setStatus('Awaiting signature…');
    mutate(
      { transaction: buildRegisterSolverTx(kovaConfig, registryId, stakeMist) },
      {
        onSuccess: (r) => {
          setStatus(`Registered — you're a solver. tx ${r.digest.slice(0, 10)}…`);
          refresh();
        },
        onError: (e) => setStatus(`Error: ${e.message}`),
      },
    );
  }

  function unstake() {
    if (!account || !myRecord) return;
    setStatus('Awaiting signature…');
    mutate(
      { transaction: buildDeregisterSolverTx(kovaConfig, registryId, myRecord.recordId, account.address) },
      {
        onSuccess: (r) => {
          setStatus(`Unstaked — stake returned. tx ${r.digest.slice(0, 10)}…`);
          refresh();
        },
        onError: (e) => setStatus(`Error: ${e.message}`),
      },
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Become a solver</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Stake SUI to join the permissionless solver set and compete to fill intents.
      </p>

      <div className="mt-5">
        {!ready ? (
          <Note>Set NEXT_PUBLIC_KOVA_REGISTRY_ID to enable staking.</Note>
        ) : !account ? (
          <Note>Connect your wallet to stake and join the solver set.</Note>
        ) : myRecord ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-violet-300">You&apos;re a registered solver</div>
                <div className="mt-0.5 text-xs text-zinc-400">
                  {myRecord.fillsCompleted.toString()} fills · staked{' '}
                  {formatUnits(myRecord.stake, 9)} SUI
                </div>
              </div>
            </div>
            <button
              onClick={unstake}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-700 py-3 font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-40"
            >
              {isPending ? 'Submitting…' : 'Unstake & leave'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-zinc-400">Stake amount</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none"
                />
                <span className="flex items-center rounded-lg bg-zinc-800 px-3 text-zinc-300">SUI</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Minimum 1 SUI. Withdraw any time by unstaking.</p>
            </div>
            <button
              onClick={register}
              disabled={isPending}
              className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
            >
              {isPending ? 'Submitting…' : 'Stake & become a solver'}
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          Staking mints your on-chain solver rights. To actually fill intents, run the solver bot with
          this wallet.
        </p>
        {status && <p className="mt-2 text-sm text-zinc-400">{status}</p>}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}
