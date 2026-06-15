import { IntentForm } from '@/components/IntentForm';
import { SolverFeed } from '@/components/SolverFeed';
import { ProtocolStats } from '@/components/ProtocolStats';

export default function SwapPage() {
  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Intents, settled atomically on Sui
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-400">
          Declare what you want. A permissionless solver network competes to fill it in a single
          PTB routed through DeepBook. Fall short of your minimum and the whole transaction reverts.
        </p>
      </section>

      <ProtocolStats />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex justify-center">
          <IntentForm />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Live intents
          </h2>
          <SolverFeed limit={8} />
        </div>
      </div>
    </div>
  );
}
