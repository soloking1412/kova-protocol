/**
 * Register the solver by staking SUI into the KOVA registry.
 * Prints the resulting SolverRecord id for solver/.env.
 *
 * Run from the solver directory so it loads solver/.env:
 *   cd solver && npx tsx ../scripts/fund-solver.ts
 */
import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet' | 'devnet' | 'localnet';
const rpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const grpcUrl = process.env.SUI_GRPC_URL ?? 'https://fullnode.testnet.sui.io:443';

const packageId = required('KOVA_PACKAGE_ID');
const registryId = required('REGISTRY_ID', process.argv[2]);
const stakeMist = BigInt(process.env.STAKE_MIST ?? '1000000000'); // 1 SUI (min stake)

const keypair = Ed25519Keypair.fromSecretKey(required('SOLVER_PRIVATE_KEY'));
const address = keypair.getPublicKey().toSuiAddress();

const grpc = new SuiGrpcClient({ network, baseUrl: grpcUrl });
const rpc = new SuiJsonRpcClient({ url: rpcUrl, network });

async function main(): Promise<void> {
  console.log(`Registering solver ${address} (stake ${stakeMist} MIST)...`);

  const tx = new Transaction();
  tx.setSender(address);
  const [stake] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeMist)]);
  tx.moveCall({
    target: `${packageId}::registry::register`,
    arguments: [tx.object(registryId), stake, tx.object('0x6')],
  });

  const result = await grpc.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include: { effects: true },
  });
  if (result.$kind !== 'Transaction') throw new Error('registration failed');
  console.log(`  tx: ${result.Transaction.digest}`);

  // The fullnode may index the new object a moment after execution, so retry.
  let recordId: string | undefined;
  for (let attempt = 0; attempt < 10 && !recordId; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const owned = await rpc.getOwnedObjects({
      owner: address,
      filter: { StructType: `${packageId}::registry::SolverRecord` },
      options: { showType: true },
    });
    recordId = owned.data[0]?.data?.objectId;
  }
  if (!recordId) throw new Error('SolverRecord not found after registration');

  console.log('');
  console.log('Add to solver/.env:');
  console.log(`  SOLVER_RECORD_ID=${recordId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
