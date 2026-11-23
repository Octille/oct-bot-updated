/** An error whose message is safe to show the user (sent as an ephemeral reply). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export type EconomyErrorCode =
  | 'INSUFFICIENT_WALLET'
  | 'INSUFFICIENT_BANK'
  | 'INSUFFICIENT_ITEMS'
  | 'BANK_FULL'
  | 'INVALID_AMOUNT'
  | 'SELF_TRANSFER'
  | 'NO_PROFILE';

export class EconomyError extends UserError {
  constructor(public readonly code: EconomyErrorCode, message: string) {
    super(message);
    this.name = 'EconomyError';
  }
}
