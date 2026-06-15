import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import { CLOCK_ID, type IntentCreatedEvent } from '@kova/sdk';
import { config, grpcClient, keypair, solverAddress } from './config';
import { deepBookClient } from './deepbook';
import type { Quote } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function canon(type: string): string {
  return normalizeStructTag(type.startsWith('0x') ? type : `0x${type}`);
}

/** Build the atomic fill PTB: take_input -> DeepBook swap -> settle. */
function buildFillTx(intent: IntentCreatedEvent, quote: Quote): Transaction {
  const inputType = canon(intent.inputType);
  const outputType = canon(intent.outputType);
  const { poolKey, direction, inputHuman } = quote.route;

  const tx = new Transaction();
  tx.setSender(solverAddress);
  // Set explicitly so the DeepBook SDK's higher default budget doesn't override.
  tx.setGasBudget(config.gasBudgetMist);

  const [inputCoin, receipt] = tx.moveCall({
    target: `${config.packageId}::settlement::take_input`,
    typeArguments: [inputType],
    arguments: [tx.object(intent.intentId), tx.object(config.solverRecordId), tx.object(CLOCK_ID)],
  });

  // Whitelisted pools report deepRequired = 0. Otherwise the SDK's
  // coinWithBalance resolver sources DEEP from the solver's balance for taker
  // fees; the headroom covers quote-vs-execution drift and returns as change.
  const deepAmount = quote.deepRequired > 0 ? quote.deepRequired * 1.5 : 0;

  let outputCoin: TransactionObjectArgument;
  let leftovers: TransactionObjectArgument[];
  if (direction === 'baseForQuote') {
    const [baseRemainder, quoteOut, deepRemainder] = deepBookClient.deepBook.swapExactBaseForQuote({
      poolKey,
      amount: inputHuman,
      deepAmount,
      minOut: 0,
      baseCoin: inputCoin,
    })(tx);
    outputCoin = quoteOut;
    leftovers = [baseRemainder, deepRemainder];
  } else {
    const [baseOut, quoteRemainder, deepRemainder] = deepBookClient.deepBook.swapExactQuoteForBase({
      poolKey,
      amount: inputHuman,
      deepAmount,
      minOut: 0,
      quoteCoin: inputCoin,
    })(tx);
    outputCoin = baseOut;
    leftovers = [quoteRemainder, deepRemainder];
  }

  tx.moveCall({
    target: `${config.packageId}::settlement::settle`,
    typeArguments: [inputType, outputType],
    arguments: [
      tx.object(intent.intentId),
      tx.object(config.solverRecordId),
      tx.object(config.feeCollectorId),
      receipt,
      outputCoin,
      tx.object(CLOCK_ID),
    ],
  });

  // Dust from the swap (leftover input + unused DEEP) returns to the solver.
  tx.transferObjects(leftovers, solverAddress);
  return tx;
}

function isStaleObjectError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error);
  return /unavailable for consumption|needs to be rebuilt|not available for consumption/i.test(message);
}

/**
 * Fill an intent. If the routed output is below the user's minimum, `settle`
 * aborts and the whole PTB reverts, leaving the escrow untouched. Transient
 * object-version conflicts (back-to-back fills reusing the solver's coins) are
 * retried with a fresh build.
 */
export async function executeIntent(intent: IntentCreatedEvent, quote: Quote): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tx = buildFillTx(intent, quote);
    try {
      const result = await grpcClient.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        include: { effects: true },
      });
      if (result.$kind !== 'Transaction') {
        throw new Error(`settlement transaction failed for intent ${intent.intentId}`);
      }
      // Let the fill settle so the next build sees fresh coin/gas versions.
      const digest = result.Transaction.digest;
      await grpcClient.waitForTransaction({ digest });
      return digest;
    } catch (error) {
      lastError = error;
      if (isStaleObjectError(error) && attempt < 2) {
        await sleep(2500);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
