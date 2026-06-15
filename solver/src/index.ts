import { createServer } from 'node:http';
import type { IntentCreatedEvent } from '@kova/sdk';
import { config, solverAddress } from './config';
import { watchIntents } from './watcher';
import { getQuote } from './quoter';
import { executeIntent } from './executor';
import { logFill } from './walrus-logger';

// Mirror of the on-chain surplus split in settlement.move.
const PROTOCOL_FEE_BPS = 5n;
const USER_SURPLUS_BPS = 5_000n;
const processing = new Set<string>();

// Live status, surfaced over HTTP so a host (and uptime pingers) can keep the
// long-running solver awake and judges can see it filling.
const startedAt = Date.now();
let fills = 0;
let lastFill: { intentId: string; txDigest: string; at: number } | null = null;

async function handleIntent(intent: IntentCreatedEvent): Promise<void> {
  if (processing.has(intent.intentId)) return;
  if (Date.now() >= Number(intent.deadlineMs)) return;

  processing.add(intent.intentId);
  try {
    console.log(
      `intent ${intent.intentId} | ${intent.inputAmount} ${short(intent.inputType)} -> min ${intent.minOutputAmount} ${short(intent.outputType)}`,
    );

    const quote = await getQuote(intent);
    if (!quote) {
      console.log('  no DeepBook route, skipping');
      return;
    }

    // The fill reverts unless the route clears the user's floor.
    if (quote.estimatedOutput < intent.minOutputAmount) {
      console.log(`  estimate ${quote.estimatedOutput} below floor ${intent.minOutputAmount}, skipping`);
      return;
    }
    // The solver keeps only its share of the surplus above the floor; fill only
    // when that reward clears the configured margin, so we never spend gas for
    // nothing.
    const surplus = quote.estimatedOutput - intent.minOutputAmount;
    const protocolFee = (surplus * PROTOCOL_FEE_BPS) / 10_000n;
    const solverReward = ((surplus - protocolFee) * (10_000n - USER_SURPLUS_BPS)) / 10_000n;
    if (intent.minOutputAmount > 0n) {
      const rewardBps = Number((solverReward * 10_000n) / intent.minOutputAmount);
      if (rewardBps < config.minProfitBps) {
        console.log(`  solver reward ${rewardBps}bps below threshold ${config.minProfitBps}bps, skipping`);
        return;
      }
    }

    console.log(`  filling via ${quote.route.poolKey} (${quote.route.direction}), est ${quote.estimatedOutput}`);
    const txDigest = await executeIntent(intent, quote);
    console.log(`  filled | tx ${txDigest}`);
    fills += 1;
    lastFill = { intentId: intent.intentId, txDigest, at: Date.now() };

    const blobId = await logFill({
      intentId: intent.intentId,
      solver: solverAddress,
      inputType: intent.inputType,
      inputAmount: intent.inputAmount.toString(),
      outputType: intent.outputType,
      estimatedOutput: quote.estimatedOutput.toString(),
      poolKey: quote.route.poolKey,
      txDigest,
      timestamp: Date.now(),
    });
    if (blobId) console.log(`  audit logged to Walrus | blob ${blobId}`);
  } catch (error) {
    console.error(`  error filling ${intent.intentId}:`, error);
  } finally {
    processing.delete(intent.intentId);
  }
}

function short(type: string): string {
  const parts = type.split('::');
  return parts[parts.length - 1] ?? type;
}

// Bind an HTTP port so the solver can run on a free web host (e.g. Render),
// which requires a listening port and pings it to keep the instance awake.
function startHealthServer(): void {
  const port = Number(process.env.PORT ?? 8080);
  createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        address: solverAddress,
        network: config.network,
        package: config.packageId,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        fills,
        lastFill,
      }),
    );
  }).listen(port, () => console.log(`  health server on :${port}`));
}

async function main(): Promise<void> {
  console.log(`KOVA solver online`);
  console.log(`  address: ${solverAddress}`);
  console.log(`  package: ${config.packageId}`);
  console.log(`  network: ${config.network}`);
  startHealthServer();
  await watchIntents(handleIntent);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
