import { Transaction } from '@mysten/sui/transactions';
import { CLOCK_ID, type KovaConfig } from './config';

/** Minimum stake to register a solver, mirroring `registry::MIN_STAKE` (1 SUI). */
export const MIN_STAKE_MIST = 1_000_000_000n;

/**
 * Build a PTB that stakes SUI and registers the sender as a solver, minting a
 * `SolverRecord` to them. The stake is split from gas, so the wallet needs
 * `stakeMist` plus gas.
 */
export function buildRegisterSolverTx(
  config: KovaConfig,
  registryId: string,
  stakeMist: bigint,
): Transaction {
  const tx = new Transaction();
  const [stake] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeMist)]);
  tx.moveCall({
    target: `${config.packageId}::registry::register`,
    arguments: [tx.object(registryId), stake, tx.object(CLOCK_ID)],
  });
  return tx;
}

/**
 * Build a PTB that deregisters the sender's solver record and returns the
 * staked SUI to them. Consumes the record.
 */
export function buildDeregisterSolverTx(
  config: KovaConfig,
  registryId: string,
  recordId: string,
  recipient: string,
): Transaction {
  const tx = new Transaction();
  const [stake] = tx.moveCall({
    target: `${config.packageId}::registry::deregister`,
    arguments: [tx.object(registryId), tx.object(recordId)],
  });
  tx.transferObjects([stake], recipient);
  return tx;
}
