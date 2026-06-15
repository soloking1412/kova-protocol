import type { EventId } from '@mysten/sui/jsonRpc';
import { getOpenIntents, parseCreatedEvent, type IntentCreatedEvent, type IntentView } from '@kova/sdk';
import { config, rpcClient } from './config';

const INTENT_CREATED = `${config.packageId}::events::IntentCreated`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll for new `IntentCreated` events and hand each to `onIntent`.
 *
 * Cursor-based polling over JSON-RPC is reliable and simple. The production
 * upgrade is gRPC checkpoint streaming via
 * `grpcClient.subscriptionService.subscribeCheckpoints` — swap it in here
 * without touching the rest of the solver.
 */
function toEvent(intent: IntentView): IntentCreatedEvent {
  return {
    intentId: intent.intentId,
    owner: intent.owner,
    inputType: intent.inputType,
    inputAmount: intent.inputAmount,
    outputType: intent.outputType,
    minOutputAmount: intent.minOutputAmount,
    deadlineMs: intent.deadlineMs,
  };
}

export async function watchIntents(
  onIntent: (intent: IntentCreatedEvent) => Promise<void>,
): Promise<void> {
  // Backfill: fill any intent that is already open before streaming new ones.
  const open = await getOpenIntents(rpcClient, config, 50);
  for (const intent of open) await onIntent(toEvent(intent));

  // Then stream from the newest event so we don't reprocess the backfill.
  let cursor: EventId | null = null;
  const latest = await rpcClient.queryEvents({
    query: { MoveEventType: INTENT_CREATED },
    limit: 1,
    order: 'descending',
  });
  if (latest.data.length > 0) cursor = latest.data[0].id;

  for (;;) {
    try {
      const page = await rpcClient.queryEvents({
        query: { MoveEventType: INTENT_CREATED },
        cursor,
        order: 'ascending',
        limit: 50,
      });

      for (const event of page.data) {
        cursor = event.id;
        await onIntent(parseCreatedEvent(event.parsedJson as Record<string, unknown>));
      }
    } catch (error) {
      console.error('watch error:', error);
    }
    await sleep(config.pollIntervalMs);
  }
}
