/**
 * Create a KOVA intent (demonstrates @kova/sdk). Run from the solver directory
 * so it loads solver/.env:
 *   cd solver && npx tsx ../scripts/create-intent.ts SUI DBUSDC 0.1 0.001 5
 * Args: <fromSymbol> <toSymbol> <amount> <minReceived> <deadlineMinutes>
 */
import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { buildCreateIntentTx, getCreatedIntentEvents, TESTNET_TOKENS, type KovaConfig, type SuiNetwork } from '@kova/sdk';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function token(symbol: string) {
  const t = TESTNET_TOKENS.find((x) => x.symbol === symbol);
  if (!t) throw new Error(`Unknown token: ${symbol}`);
  return t;
}

function toBase(value: string, decimals: number): bigint {
  const [whole, frac = ''] = value.split('.');
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

const [fromSymbol = 'SUI', toSymbol = 'DBUSDC', amount = '0.1', minReceived = '0.001', minutes = '5'] = process.argv.slice(2);

const network = (process.env.SUI_NETWORK ?? 'testnet') as SuiNetwork;
const rpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const grpcUrl = process.env.SUI_GRPC_URL ?? 'https://fullnode.testnet.sui.io:443';

const config: KovaConfig = { packageId: required('KOVA_PACKAGE_ID'), network };
const keypair = Ed25519Keypair.fromSecretKey(required('SOLVER_PRIVATE_KEY'));
const address = keypair.getPublicKey().toSuiAddress();

const grpc = new SuiGrpcClient({ network, baseUrl: grpcUrl });
const rpc = new SuiJsonRpcClient({ url: rpcUrl, network });

async function main(): Promise<void> {
  const from = token(fromSymbol);
  const to = token(toSymbol);
  const inputAmount = toBase(amount, from.decimals);
  const minOutputAmount = toBase(minReceived, to.decimals);

  let inputCoinObjectId: string | undefined;
  if (from.symbol !== 'SUI') {
    const coins = await rpc.getCoins({ owner: address, coinType: from.type });
    inputCoinObjectId = coins.data.find((c) => BigInt(c.balance) >= inputAmount)?.coinObjectId;
    if (!inputCoinObjectId) throw new Error(`No ${from.symbol} coin with enough balance`);
  }

  const tx = buildCreateIntentTx(config, {
    inputType: from.type,
    inputAmount,
    inputCoinObjectId,
    outputType: to.type,
    minOutputAmount,
    deadlineOffsetMs: Number(minutes) * 60_000,
  });

  console.log(`Creating intent: ${amount} ${from.symbol} -> >= ${minReceived} ${to.symbol} (${minutes}m)`);
  const result = await grpc.signAndExecuteTransaction({ transaction: tx, signer: keypair, include: { effects: true } });
  if (result.$kind !== 'Transaction') throw new Error('intent creation failed');
  console.log(`  tx: ${result.Transaction.digest}`);

  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const events = await getCreatedIntentEvents(rpc, config, 1);
    if (events[0]) {
      console.log(`  intent id: ${events[0].intentId}`);
      return;
    }
  }
  console.log('  (intent created; event not yet indexed)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
