import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import type { KovaConfig } from './config';
import { IntentStatus, type IntentCreatedEvent, type IntentView, type SolverView } from './types';

/** Decode a Move `vector<u8>` field (number array or base64 string) to a string. */
function bytesToString(value: unknown): string {
  if (Array.isArray(value)) {
    return new TextDecoder().decode(Uint8Array.from(value as number[]));
  }
  if (typeof value === 'string') {
    if (value.includes('::')) return value;
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
      if (decoded.includes('::')) return decoded;
    } catch {
      // not base64; fall through
    }
    return value;
  }
  return String(value);
}

/** Read a Move `Option` field from object content (null, bare value, or { vec: [...] }). */
function optionValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && 'vec' in value) {
    const vec = (value as { vec: unknown[] }).vec;
    return vec.length > 0 ? vec[0] : null;
  }
  return value;
}

export function parseCreatedEvent(parsedJson: Record<string, unknown>): IntentCreatedEvent {
  return {
    intentId: String(parsedJson.intent_id),
    owner: String(parsedJson.owner),
    inputType: bytesToString(parsedJson.input_type),
    inputAmount: BigInt(String(parsedJson.input_amount)),
    outputType: bytesToString(parsedJson.output_type),
    minOutputAmount: BigInt(String(parsedJson.min_output_amount)),
    deadlineMs: BigInt(String(parsedJson.deadline_ms)),
  };
}

export async function getCreatedIntentEvents(
  client: SuiJsonRpcClient,
  config: KovaConfig,
  limit = 50,
): Promise<IntentCreatedEvent[]> {
  const { data } = await client.queryEvents({
    query: { MoveEventType: `${config.packageId}::events::IntentCreated` },
    limit,
    order: 'descending',
  });
  return data.map((event) => parseCreatedEvent(event.parsedJson as Record<string, unknown>));
}

function parseIntentContent(intentId: string, fields: Record<string, unknown>): IntentView {
  const solver = optionValue(fields.solver);
  const actualOutput = optionValue(fields.actual_output);
  return {
    intentId,
    owner: String(fields.owner),
    inputType: bytesToString(fields.input_type),
    inputAmount: BigInt(String(fields.input_amount)),
    outputType: bytesToString(fields.output_type),
    minOutputAmount: BigInt(String(fields.min_output_amount)),
    createdAtMs: BigInt(String(fields.created_at_ms)),
    deadlineMs: BigInt(String(fields.deadline_ms)),
    status: Number(fields.status) as IntentStatus,
    solver: solver == null ? null : String(solver),
    actualOutput: actualOutput == null ? null : BigInt(String(actualOutput)),
  };
}

export async function getIntentView(
  client: SuiJsonRpcClient,
  intentId: string,
): Promise<IntentView | null> {
  const res = await client.getObject({ id: intentId, options: { showContent: true } });
  const content = res.data?.content;
  if (!content || content.dataType !== 'moveObject') return null;
  return parseIntentContent(intentId, content.fields as Record<string, unknown>);
}

/** List recent intents (most recent first) with their live on-chain status. */
export async function listIntents(
  client: SuiJsonRpcClient,
  config: KovaConfig,
  limit = 50,
): Promise<IntentView[]> {
  const events = await getCreatedIntentEvents(client, config, limit);
  if (events.length === 0) return [];
  const objects = await client.multiGetObjects({
    ids: events.map((e) => e.intentId),
    options: { showContent: true },
  });
  const views: IntentView[] = [];
  for (const obj of objects) {
    const content = obj.data?.content;
    if (content && content.dataType === 'moveObject') {
      views.push(parseIntentContent(obj.data!.objectId, content.fields as Record<string, unknown>));
    }
  }
  return views;
}

export async function getOpenIntents(
  client: SuiJsonRpcClient,
  config: KovaConfig,
  limit = 50,
): Promise<IntentView[]> {
  const all = await listIntents(client, config, limit);
  return all.filter((i) => i.status === IntentStatus.Open);
}

export interface ProtocolStats {
  solvers: number;
  totalStake: bigint;
  totalFills: bigint;
}

/** Aggregate protocol stats derived from the live solver records. */
export async function getProtocolStats(
  client: SuiJsonRpcClient,
  config: KovaConfig,
): Promise<ProtocolStats> {
  const solvers = await getSolvers(client, config, 100);
  return {
    solvers: solvers.length,
    totalStake: solvers.reduce((sum, s) => sum + s.stake, 0n),
    totalFills: solvers.reduce((sum, s) => sum + s.fillsCompleted, 0n),
  };
}

/** Read the solver leaderboard from `SolverRegistered` events and their records. */
export async function getSolvers(
  client: SuiJsonRpcClient,
  config: KovaConfig,
  limit = 50,
): Promise<SolverView[]> {
  const { data } = await client.queryEvents({
    query: { MoveEventType: `${config.packageId}::events::SolverRegistered` },
    limit,
    order: 'descending',
  });
  const recordIds = data.map((e) => String((e.parsedJson as Record<string, unknown>).record_id));
  if (recordIds.length === 0) return [];

  const objects = await client.multiGetObjects({
    ids: recordIds,
    options: { showContent: true },
  });
  const solvers: SolverView[] = [];
  for (const obj of objects) {
    const content = obj.data?.content;
    if (content && content.dataType === 'moveObject') {
      const fields = content.fields as Record<string, unknown>;
      solvers.push({
        recordId: obj.data!.objectId,
        solver: String(fields.solver),
        stake: BigInt(String(fields.stake)),
        fillsCompleted: BigInt(String(fields.fills_completed)),
        volumeFilled: BigInt(String(fields.volume_filled)),
      });
    }
  }
  return solvers;
}
