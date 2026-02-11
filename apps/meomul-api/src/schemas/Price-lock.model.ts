import { Schema } from "mongoose";

const PriceLockSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    lockedPrice: {
      type: Number,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'pricelocks',
  }
);

// TTL index - auto-delete after expiration
PriceLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PriceLockSchema.index({ userId: 1, roomId: 1 });

export default PriceLockSchema;