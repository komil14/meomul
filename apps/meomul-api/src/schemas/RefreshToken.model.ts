import { Schema } from 'mongoose';

const RefreshTokenSchema = new Schema(
	{
		tokenHash: {
			type: String,
			required: true,
			unique: true,
		},
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		revoked: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
		collection: 'refreshTokens',
	},
);

// TTL index: automatically delete expired tokens after 1 day grace period
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

// Fast lookup by memberId for revocation
RefreshTokenSchema.index({ memberId: 1, revoked: 1 });

export default RefreshTokenSchema;
