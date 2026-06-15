import 'dotenv/config';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { SuiNetwork } from '@kova/sdk';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const NETWORK = (process.env.SUI_NETWORK ?? 'testnet') as SuiNetwork;
const RPC_URL = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
const GRPC_URL = process.env.SUI_GRPC_URL ?? 'https://fullnode.testnet.sui.io:443';

export const config = {
  network: NETWORK,
  packageId: required('KOVA_PACKAGE_ID'),
  solverRecordId: required('SOLVER_RECORD_ID'),
  feeCollectorId: required('FEE_COLLECTOR_ID'),
  minProfitBps: Number(process.env.MIN_PROFIT_BPS ?? '5'),
  gasBudgetMist: BigInt(process.env.GAS_BUDGET_MIST ?? '100000000'),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? '2500'),
  walrusEpochs: Number(process.env.WALRUS_EPOCHS ?? '5'),
  enableWalrus: process.env.ENABLE_WALRUS !== 'false',
  // Direct sliver upload is flaky on testnet; the relay is the robust path.
  walrusUploadRelay: process.env.WALRUS_UPLOAD_RELAY ?? 'https://upload-relay.testnet.walrus.space',
  walrusTipMax: Number(process.env.WALRUS_TIP_MAX ?? '1000000'),
};

export const keypair = Ed25519Keypair.fromSecretKey(required('SOLVER_PRIVATE_KEY'));
export const solverAddress = keypair.getPublicKey().toSuiAddress();

/** gRPC client drives the settlement-critical execution path. */
export const grpcClient = new SuiGrpcClient({ network: NETWORK, baseUrl: GRPC_URL });

/** JSON-RPC client serves event polling and DeepBook reads. */
export const rpcClient = new SuiJsonRpcClient({ url: RPC_URL, network: NETWORK });
