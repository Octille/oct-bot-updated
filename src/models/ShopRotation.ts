import { Schema, model } from 'mongoose';

/** The daily shop rotation. `_id` is the UTC day number; stock is shared by every player. */
const shopRotationSchema = new Schema(
  {
    _id: { type: Number, required: true },
    stock: [{
      id: { type: String, required: true },
      kind: { type: String, enum: ['item', 'cosmetic'], required: true },
      price: { type: Number, required: true },
      remaining: { type: Number, required: true, min: 0 },
      _id: false,
    }],
  },
  { collection: 'shop_rotations', versionKey: false },
);

export const ShopRotation = model('ShopRotation', shopRotationSchema);
