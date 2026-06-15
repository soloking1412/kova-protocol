import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { normalizeStructTag } from '@mysten/sui/utils';
import { CLOCK_ID, isSuiType, Protocol, type KovaConfig } from './config';
import type { CreateIntentParams } from './types';

function prepareInputCoin(tx: Transaction, params: CreateIntentParams): TransactionObjectArgument {
  const amount = tx.pure.u64(params.inputAmount);
  if (isSuiType(params.inputType)) {
    const [coin] = tx.splitCoins(tx.gas, [amount]);
    return coin;
  }
  if (!params.inputCoinObjectId) {
    throw new Error('inputCoinObjectId is required when the input coin is not SUI');
  }
  const [coin] = tx.splitCoins(tx.object(params.inputCoinObjectId), [amount]);
  return coin;
}

/**
 * Build a PTB that escrows the input coin into a fresh `KovaIntent` and shares
 * it so the solver network can compete to fill it.
 */
export function buildCreateIntentTx(config: KovaConfig, params: CreateIntentParams): Transaction {
  const tx = new Transaction();
  const inputType = normalizeStructTag(params.inputType);
  const outputType = normalizeStructTag(params.outputType);
  const inputCoin = prepareInputCoin(tx, params);

  const outputTypeBytes = Array.from(new TextEncoder().encode(outputType));

  const [intent] = tx.moveCall({
    target: `${config.packageId}::intent::create_intent`,
    typeArguments: [inputType],
    arguments: [
      inputCoin,
      tx.pure.vector('u8', outputTypeBytes),
      tx.pure.u64(params.minOutputAmount),
      tx.pure.u8(params.preferredProtocols ?? Protocol.DeepBook),
      tx.pure.bool(params.allowSplitRouting ?? true),
      tx.pure.u64(BigInt(params.deadlineOffsetMs)),
      tx.object(CLOCK_ID),
    ],
  });

  tx.moveCall({
    target: `${config.packageId}::intent::share_intent`,
    typeArguments: [inputType],
    arguments: [intent],
  });

  return tx;
}

/** Build a PTB that cancels an open intent and refunds the escrow to the owner. */
export function buildCancelIntentTx(
  config: KovaConfig,
  intentId: string,
  inputType: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.packageId}::intent::cancel_intent`,
    typeArguments: [normalizeStructTag(inputType)],
    arguments: [tx.object(intentId)],
  });
  return tx;
}
