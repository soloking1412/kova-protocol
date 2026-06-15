'use client';

import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildCancelIntentTx,
  findToken,
  IntentStatus,
  listIntents,
  type IntentView,
} from '@kova/sdk';
import { formatUnits, isConfigured, kovaConfig } from '@/lib/kova';
import { StatusBadge } from './StatusBadge';
import { Countdown } from './Countdown';
import { SettlementViewer } from './SettlementViewer';

export function SolverFeed({ limit = 20 }: { limit?: number }) {
  const client = useSuiClient();
  const { data: intents = [], isLoading } = useQuery({
    queryKey: ['intents', kovaConfig.packageId, limit],
    queryFn: () => listIntents(client, kovaConfig, limit),
    refetchInterval: 4000,
    enabled: isConfigured,
  });

  if (!isConfigured) {
    return <Empty>Set NEXT_PUBLIC_KOVA_PACKAGE_ID to view the live feed.</Empty>;
  }
  if (isLoading) return <Empty>Loading intents…</Empty>;
  if (intents.length === 0) return <Empty>No intents yet. Submit the first one.</Empty>;

  return (
    <div className="space-y-2">
      {intents.map((intent) => (
        <IntentRow key={intent.intentId} intent={intent} />
      ))}
    </div>
  );
}

function IntentRow({ intent }: { intent: IntentView }) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const inToken = findToken(intent.inputType);
  const outToken = findToken(intent.outputType);
  const give = inToken
    ? `${formatUnits(intent.inputAmount, inToken.decimals)} ${inToken.symbol}`
    : intent.inputAmount.toString();
  const want = outToken
    ? `${formatUnits(intent.minOutputAmount, outToken.decimals)} ${outToken.symbol}`
    : intent.minOutputAmount.toString();

  const isOwner = account?.address === intent.owner;
  const canCancel = isOwner && intent.status === IntentStatus.Open;

  function cancel() {
    const tx = buildCancelIntentTx(kovaConfig, intent.intentId, intent.inputType);
    signAndExecute(
      { transaction: tx },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['intents'] }) },
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-white">{give}</span>
          <span className="mx-2 text-zinc-600">→</span>
          <span className="text-zinc-300">≥ {want}</span>
        </div>
        <div className="flex items-center gap-3">
          {intent.status === IntentStatus.Open && (
            <Countdown deadlineMs={Number(intent.deadlineMs)} />
          )}
          {canCancel && (
            <button
              onClick={cancel}
              disabled={isPending}
              className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 transition hover:border-zinc-500 disabled:opacity-40"
            >
              Cancel
            </button>
          )}
          <StatusBadge status={intent.status} />
        </div>
      </div>
      {intent.status === IntentStatus.Filled && <SettlementViewer intent={intent} />}
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
