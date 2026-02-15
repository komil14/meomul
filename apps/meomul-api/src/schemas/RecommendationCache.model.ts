import { Schema } from 'mongoose';

const RecommendationCacheSchema = new Schema(
	{
		cacheKey: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		data: {
			type: Schema.Types.Mixed,
			required: true,
		},
		computedAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
		expiresAt: {
			type: Date,
			required: true,
			index: true,
		},
	},
	{
		timestamps: true,
		collection: 'recommendationcaches',
	},
);

// TTL index: MongoDB auto-deletes expired docs
RecommendationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default RecommendationCacheSchema;
