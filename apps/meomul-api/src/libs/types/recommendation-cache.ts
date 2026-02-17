import type { Document, Types } from 'mongoose';

export interface RecommendationCacheDocument extends Document {
	_id: Types.ObjectId;
	cacheKey: string;
	data: any;
	computedAt: Date;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}
