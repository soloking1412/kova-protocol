import { DeepBookClient } from '@mysten/deepbook-v3';
import { config, rpcClient, solverAddress } from './config';

// Pool/direction selection is shared with the frontend via the SDK so routing
// can never drift between what the UI quotes and what the solver fills.
export { findPool, type PoolMatch } from '@kova/sdk';

export const deepBookClient = new DeepBookClient({
  client: rpcClient,
  address: solverAddress,
  network: config.network,
});
