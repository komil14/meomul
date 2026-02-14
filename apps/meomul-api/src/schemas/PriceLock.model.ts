import { Schema } from 'mongoose';

const LOCK_DURATION_MINUTES = 30;

const PriceLockSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		roomId: {
			type: Schema.Types.ObjectId,
			ref: 'Room',
			required: true,
			index: true,
		},
		lockedPrice: {
			type: Number,
			required: true,
			min: 0,
		},
		expiresAt: {
			type: Date,
			required: true,
			default: () => new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000),
			index: true,
		},
	},
	{
		timestamps: true,
		collection: 'pricelocks',
	},
);

// One active lock per user per room
PriceLockSchema.index({ userId: 1, roomId: 1 });

// TTL index: automatically delete expired locks after 1 hour grace period
PriceLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default PriceLockSchema;
