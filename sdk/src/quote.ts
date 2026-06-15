import {
  DeepBookClient,
  mainnetCoins,
  mainnetPools,
  testnetCoins,
  testnetPools,
} from '@mysten/deepbook-v3';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { canonType, type SuiNetwork } from './config';

export type SwapDirection = 'baseForQuote' | 'quoteForBase';

const FULLNODE_URL: Record<SuiNetwork, string> = {
  mainnet: 'https://fullnode.mainnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  devnet: 'https://fullnode.devnet.sui.io:443',
  localnet: 'http://127.0.0.1:9000',
};

/** A valid-format sender for read-only dev-inspect quotes when no wallet is connected. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

function registries(network: SuiNetwork) {
  const isMainnet = network === 'mainnet';
  return {
    coins: isMainnet ? mainnetCoins : testnetCoins,
    pools: isMainnet ? mainnetPools : testnetPools,
  };
}

export interface PoolMatch {
  poolKey: string;
  direction: SwapDirection;
  inputScalar: number;
  outputScalar: number;
}

/** Find a DeepBook pool that swaps `inputType` into `outputType`, with direction. */
export function findPool(
  inputType: string,
  outputType: string,
  network: SuiNetwork,
): PoolMatch | null {
  const { coins, pools } = registries(network);

  const coinByType = new Map<string, { coinKey: string; scalar: number }>();
  for (const [coinKey, coin] of Object.entries(coins)) {
    coinByType.set(canonType(coin.type), { coinKey, scalar: coin.scalar });
  }

  const input = coinByType.get(canonType(inputType));
  const output = coinByType.get(canonType(outputType));
  if (!input || !output) return null;

  for (const [poolKey, pool] of Object.entries(pools)) {
    if (pool.baseCoin === input.coinKey && pool.quoteCoin === output.coinKey) {
      return { poolKey, direction: 'baseForQuote', inputScalar: input.scalar, outputScalar: output.scalar };
    }
    if (pool.baseCoin === output.coinKey && pool.quoteCoin === input.coinKey) {
      return { poolKey, direction: 'quoteForBase', inputScalar: input.scalar, outputScalar: output.scalar };
    }
  }
  return null;
}

export interface QuoteParams {
  network: SuiNetwork;
  inputType: string;
  /** Input amount in the input coin's base units. */
  inputAmount: bigint;
  outputType: string;
  /** Sender for the dev-inspect call; defaults to the zero address. */
  address?: string;
  /** Override the fullnode URL; defaults to the network's public fullnode. */
  rpcUrl?: string;
}

export interface QuoteResult {
  poolKey: string;
  direction: SwapDirection;
  inputHuman: number;
  inputScalar: number;
  outputScalar: number;
  /** Estimated output in the output coin's base units. */
  outputAmount: bigint;
  /** Estimated output in human units. */
  outputHuman: number;
  /** DEEP (human units) the swap needs for taker fees; 0 on whitelisted pools. */
  deepRequired: number;
}

const clientCache = new Map<string, DeepBookClient>();

function deepBookFor(network: SuiNetwork, address: string, rpcUrl: string): DeepBookClient {
  const key = `${network}:${address}:${rpcUrl}`;
  let client = clientCache.get(key);
  if (!client) {
    const sui = new SuiJsonRpcClient({ url: rpcUrl, network });
    client = new DeepBookClient({ client: sui, address, network });
    clientCache.set(key, client);
  }
  return client;
}

/**
 * Quote a swap against DeepBook. Returns the estimated output (base units and
 * human units) plus the route, or null if no pool connects the pair. Small
 * inputs below a pool's lot size quote to zero — callers should handle that.
 */
export async function getQuote(params: QuoteParams): Promise<QuoteResult | null> {
  const { network, inputType, outputType, inputAmount } = params;
  if (inputAmount <= 0n) return null;

  const pool = findPool(inputType, outputType, network);
  if (!pool) return null;

  const address = params.address ?? ZERO_ADDRESS;
  const rpcUrl = params.rpcUrl ?? FULLNODE_URL[network];
  const deepBook = deepBookFor(network, address, rpcUrl);

  const inputHuman = Number(inputAmount) / pool.inputScalar;

  let outputHuman: number;
  let deepRequired: number;
  if (pool.direction === 'baseForQuote') {
    const quote = await deepBook.getQuoteQuantityOut(pool.poolKey, inputHuman);
    outputHuman = quote.quoteOut;
    deepRequired = quote.deepRequired;
  } else {
    const quote = await deepBook.getBaseQuantityOut(pool.poolKey, inputHuman);
    outputHuman = quote.baseOut;
    deepRequired = quote.deepRequired;
  }

  return {
    poolKey: pool.poolKey,
    direction: pool.direction,
    inputHuman,
    inputScalar: pool.inputScalar,
    outputScalar: pool.outputScalar,
    outputAmount: BigInt(Math.floor(outputHuman * pool.outputScalar)),
    outputHuman,
    deepRequired,
  };
}
