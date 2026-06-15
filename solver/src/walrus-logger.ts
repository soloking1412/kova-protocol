import { walrus } from '@mysten/walrus';
import { config, grpcClient, keypair } from './config';

const walrusClient = grpcClient.$extend(
  walrus({
    uploadRelay: {
      host: config.walrusUploadRelay,
      sendTip: { max: config.walrusTipMax },
    },
  }),
);

export interface FillRecord {
  intentId: string;
  solver: string;
  inputType: string;
  inputAmount: string;
  outputType: string;
  estimatedOutput: string;
  poolKey: string;
  txDigest: string;
  timestamp: number;
}

/** Persist a fill record to Walrus as a permanent audit blob. Returns blobId. */
export async function logFill(record: FillRecord): Promise<string | null> {
  if (!config.enableWalrus) return null;
  try {
    const blob = new TextEncoder().encode(JSON.stringify(record, null, 2));
    const { blobId } = await walrusClient.walrus.writeBlob({
      blob,
      deletable: false,
      epochs: config.walrusEpochs,
      signer: keypair,
    });
    return blobId;
  } catch (error) {
    console.warn('walrus log failed:', error);
    return null;
  }
}
