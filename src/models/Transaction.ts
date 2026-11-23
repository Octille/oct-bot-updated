import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Every balance or item change, for auditing and inflation stats (/eco stats).
 * `delta` is positive for money/items created or received and negative for spent/destroyed.
 */
const transactionSchema = new Schema(
  {
    userId: { type: String, required: true },
    kind: { type: String, enum: ['wallet', 'bank', 'item'], required: true },
    itemId: { type: String },
    delta: { type: Number, required: true },
    /** What caused it, e.g. `work`, `give`, `give.tax`, `shop.buy`. */
    source: { type: String, required: true },
    /** True when the change moved value between two players instead of creating/destroying it. */
    transfer: { type: Boolean, default: false },
    meta: { type: Schema.Types.Mixed },
    at: { type: Date, default: () => new Date() },
  },
  { collection: 'transactions', versionKey: false },
);

transactionSchema.index({ userId: 1, at: -1 });
transactionSchema.index({ at: -1, source: 1 });

export type TransactionData = InferSchemaType<typeof transactionSchema>;
export const Transaction = model('Transaction', transactionSchema);
