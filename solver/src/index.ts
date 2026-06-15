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

async function main(): Promise<void> {
  console.log(`KOVA solver online`);
  console.log(`  address: ${solverAddress}`);
  console.log(`  package: ${config.packageId}`);
  console.log(`  network: ${config.network}`);
  await watchIntents(handleIntent);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
