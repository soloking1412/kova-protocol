import type { KovaConfig, SuiNetwork } from '@kova/sdk';

export const kovaConfig: KovaConfig = {
  packageId: process.env.NEXT_PUBLIC_KOVA_PACKAGE_ID ?? '0x0',
  network: (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as SuiNetwork,
};

export const isConfigured = kovaConfig.packageId !== '0x0';

/** Shared SolverRegistry object id; required for the self-service staking flow. */
export const registryId = process.env.NEXT_PUBLIC_KOVA_REGISTRY_ID ?? '';

/** Live solver health endpoint (Render). */
export const solverUrl = process.env.NEXT_PUBLIC_SOLVER_URL ?? '';

export function parseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.trim().split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

export function formatUnits(base: bigint, decimals: number, maxFraction = 4): string {
  const denom = 10n ** BigInt(decimals);
  const whole = base / denom;
  const fraction = base % denom;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, maxFraction)
    .replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : `${whole}`;
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function explorerTx(digest: string): string {
  return `https://suiscan.xyz/${kovaConfig.network}/tx/${digest}`;
}
