export type SwapDirection = 'baseForQuote' | 'quoteForBase';

export interface Route {
  poolKey: string;
  direction: SwapDirection;
  /** Human-readable input amount, scaled by the input coin's decimals. */
  inputHuman: number;
  inputScalar: number;
  outputScalar: number;
}

export interface Quote {
  route: Route;
  /** Estimated output in the output coin's base units. */
  estimatedOutput: bigint;
  /** DEEP (human units) the swap needs for taker fees; 0 on whitelisted pools. */
  deepRequired: number;
}
