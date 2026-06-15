import { normalizeStructTag } from '@mysten/sui/utils';

export type SuiNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export interface KovaConfig {
  packageId: string;
  network: SuiNetwork;
}

/** The Sui system clock, a fixed shared object at 0x6. */
export const CLOCK_ID = '0x6';

/** Routing-preference bitmask understood by `kova::router`. */
export const Protocol = {
  DeepBook: 1,
  Cetus: 2,
  Scallop: 4,
} as const;

export interface TokenInfo {
  symbol: string;
  type: string;
  decimals: number;
}

/**
 * Tokens KOVA recognizes on testnet. Types mirror DeepBook's testnet coin
 * registry so intents route against real pools.
 */
export const TESTNET_TOKENS: TokenInfo[] = [
  { symbol: 'SUI', type: '0x2::sui::SUI', decimals: 9 },
  {
    symbol: 'DBUSDC',
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    decimals: 6,
  },
  {
    symbol: 'DEEP',
    type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    decimals: 6,
  },
  {
    symbol: 'DBTC',
    type: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC',
    decimals: 8,
  },
  {
    symbol: 'WAL',
    type: '0x9ef7676a9f81937a52ae4b2af8d511a28a0b080477c0c2db40b0ab8882240d76::wal::WAL',
    decimals: 9,
  },
];

/** Canonicalize a type so on-chain (no-0x) and SDK (0x) forms compare equal. */
export function canonType(type: string): string {
  return normalizeStructTag(type.startsWith('0x') ? type : `0x${type}`);
}

const SUI_TYPE = canonType('0x2::sui::SUI');

export function isSuiType(type: string): boolean {
  return canonType(type) === SUI_TYPE;
}

export function findToken(type: string): TokenInfo | undefined {
  const normalized = canonType(type);
  return TESTNET_TOKENS.find((t) => canonType(t.type) === normalized);
}
