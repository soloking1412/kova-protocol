import type { IntentCreatedEvent } from '@kova/sdk';
import { config } from './config';
import { deepBookClient, findPool } from './deepbook';
import type { Quote } from './types';

/**
 * Quote an intent against DeepBook. Returns the estimated output in the output
 * coin's base units, or null if no pool routes the pair.
 */
export async function getQuote(intent: IntentCreatedEvent): Promise<Quote | null> {
  const pool = findPool(intent.inputType, intent.outputType, config.network);
  if (!pool) return null;

  const inputHuman = Number(intent.inputAmount) / pool.inputScalar;

  let outputHuman: number;
  let deepRequired: number;
  if (pool.direction === 'baseForQuote') {
    const quote = await deepBookClient.getQuoteQuantityOut(pool.poolKey, inputHuman);
    outputHuman = quote.quoteOut;
    deepRequired = quote.deepRequired;
  } else {
    const quote = await deepBookClient.getBaseQuantityOut(pool.poolKey, inputHuman);
    outputHuman = quote.baseOut;
    deepRequired = quote.deepRequired;
  }

  const estimatedOutput = BigInt(Math.floor(outputHuman * pool.outputScalar));
  return {
    route: { ...pool, inputHuman },
    estimatedOutput,
    deepRequired,
  };
}
