import { BecomeSolver } from '@/components/BecomeSolver';
import { SolverLeaderboard } from '@/components/SolverLeaderboard';
import { SolverStatusCard } from '@/components/SolverStatus';

export default function SolversPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Solver leaderboard</h1>
        <p className="mt-1 text-sm text-zinc-400">Staked solvers ranked by fills completed.</p>
      </div>
      <SolverStatusCard />
      <BecomeSolver />
      <SolverLeaderboard />
    </div>
  );
}
