import { IntentStatus } from '@kova/sdk';

const META: Record<IntentStatus, { label: string; className: string }> = {
  [IntentStatus.Open]: { label: 'Open', className: 'bg-violet-500/15 text-violet-300' },
  [IntentStatus.Filled]: { label: 'Filled', className: 'bg-emerald-500/15 text-emerald-300' },
  [IntentStatus.Expired]: { label: 'Expired', className: 'bg-zinc-500/15 text-zinc-400' },
  [IntentStatus.Cancelled]: { label: 'Cancelled', className: 'bg-zinc-500/15 text-zinc-400' },
  [IntentStatus.Claimed]: { label: 'Claiming', className: 'bg-amber-500/15 text-amber-300' },
};

export function StatusBadge({ status }: { status: IntentStatus }) {
  const meta = META[status] ?? META[IntentStatus.Open];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}
