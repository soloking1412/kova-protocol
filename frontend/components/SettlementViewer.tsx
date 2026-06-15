import { findToken, type IntentView } from '@kova/sdk';
import { formatUnits, shortAddress } from '@/lib/kova';

export function SettlementViewer({ intent }: { intent: IntentView }) {
  if (intent.actualOutput == null || intent.solver == null) return null;
  const outToken = findToken(intent.outputType);
  const decimals = outToken?.decimals ?? 0;
  const symbol = outToken?.symbol ?? '';

  const delivered = `${formatUnits(intent.actualOutput, decimals)} ${symbol}`;
  const improvement = intent.actualOutput - intent.minOutputAmount;

  return (
    <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3 text-xs text-zinc-400">
      <div>
        Settled by <span className="text-zinc-200">{shortAddress(intent.solver)}</span>
      </div>
      <div className="mt-0.5">
        Delivered <span className="text-emerald-300">{delivered}</span>
        {improvement > 0n && (
          <span className="text-zinc-500">
            {' '}
            (+{formatUnits(improvement, decimals)} above floor)
          </span>
        )}
      </div>
    </div>
  );
}
