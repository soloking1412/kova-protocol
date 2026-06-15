export enum IntentStatus {
  Open = 0,
  Filled = 1,
  Expired = 2,
  Cancelled = 3,
  Claimed = 4,
}

export interface CreateIntentParams {
  inputType: string;
  inputAmount: bigint;
  /** Required when the input is not SUI; the coin to draw the input from. */
  inputCoinObjectId?: string;
  outputType: string;
  minOutputAmount: bigint;
  deadlineOffsetMs: number;
  preferredProtocols?: number;
  allowSplitRouting?: boolean;
}

/** Parsed `IntentCreated` event. */
export interface IntentCreatedEvent {
  intentId: string;
  owner: string;
  inputType: string;
  inputAmount: bigint;
  outputType: string;
  minOutputAmount: bigint;
  deadlineMs: bigint;
}

/** Live view of an intent, read from its on-chain object. */
export interface IntentView {
  intentId: string;
  owner: string;
  inputType: string;
  inputAmount: bigint;
  outputType: string;
  minOutputAmount: bigint;
  createdAtMs: bigint;
  deadlineMs: bigint;
  status: IntentStatus;
  solver: string | null;
  actualOutput: bigint | null;
}

export interface SolverView {
  recordId: string;
  solver: string;
  stake: bigint;
  fillsCompleted: bigint;
  volumeFilled: bigint;
}
