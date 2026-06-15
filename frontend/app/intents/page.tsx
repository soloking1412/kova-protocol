import { SolverFeed } from '@/components/SolverFeed';

export default function IntentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Intent explorer</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every intent on KOVA, with its live status and settlement.
        </p>
      </div>
      <SolverFeed limit={30} />
    </div>
  );
}
