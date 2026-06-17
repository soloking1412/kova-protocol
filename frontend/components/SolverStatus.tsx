'use client';

import { useQuery } from '@tanstack/react-query';
import { solverUrl, shortAddress } from '@/lib/kova';

interface HealthData {
  status: string;
  address: string;
  network: string;
  uptimeSec: number;
  fills: number;
  lastFill: { intentId: string; txDigest: string; at: number } | null;
}

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch(solverUrl, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error('offline');
  return res.json();
}

export function SolverStatusBadge() {
  const { data, isError } = useQuery({
    queryKey: ['solver-health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    enabled: !!solverUrl,
    retry: 1,
  });

  if (!solverUrl) return null;

  const online = !isError && data?.status === 'online';

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs">
      <span
        className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
        style={online ? { boxShadow: '0 0 4px #34d399' } : undefined}
      />
      <span className={online ? 'text-zinc-300' : 'text-zinc-600'}>
        {online ? `Solver · ${data.fills} fill${data.fills !== 1 ? 's' : ''}` : 'Solver offline'}
      </span>
    </div>
  );
}

export function SolverStatusCard() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['solver-health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    enabled: !!solverUrl,
    retry: 1,
  });

  if (!solverUrl) return null;

  const online = !isError && !isLoading && data?.status === 'online';

  function fmtUptime(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Live solver</h2>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
            style={online ? { boxShadow: '0 0 6px #34d399' } : undefined}
          />
          <span className={`text-xs ${online ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {isLoading ? 'Checking…' : online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {online && data && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Fills" value={data.fills.toString()} />
          <Stat label="Uptime" value={fmtUptime(data.uptimeSec)} />
          <Stat label="Network" value={data.network} />
        </div>
      )}

      {online && data && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs text-zinc-500">Solver address</p>
          <a
            href={`https://suiscan.xyz/${data.network}/account/${data.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 font-mono text-xs text-violet-400 hover:text-violet-300 transition"
          >
            {shortAddress(data.address)}
          </a>
        </div>
      )}

      {online && data?.lastFill && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs text-zinc-500">Last fill</p>
          <a
            href={`https://suiscan.xyz/${data.network}/tx/${data.lastFill.txDigest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 font-mono text-xs text-violet-400 hover:text-violet-300 transition"
          >
            {shortAddress(data.lastFill.txDigest)}
          </a>
          <p className="mt-0.5 text-xs text-zinc-600">
            {new Date(data.lastFill.at).toLocaleString()}
          </p>
        </div>
      )}

      {!isLoading && !online && (
        <p className="mt-3 text-sm text-zinc-500">
          The solver bot may be spinning up — Render free tier cold-starts in ~30s.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
