import { Schema } from 'mongoose';
import { LikeGroup } from '../libs/enums/common.enum';

const LikeSchema = new Schema(
	{
		likeGroup: {
			type: String,
			enum: Object.values(LikeGroup),
			required: true,
		},
		likeRefId: {
			type: Schema.Types.ObjectId,
			required: true,
		},
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
		},
	},
	{
		timestamps: true,
		collection: 'likes',
	},
);

LikeSchema.index({ likeRefId: 1, memberId: 1 }, { unique: true });

// Recommendation: per-user hotel likes lookup
LikeSchema.index({ likeGroup: 1, memberId: 1 });

// Recommendation: trending aggregation (recent likes across all users)
LikeSchema.index({ likeGroup: 1, createdAt: -1 });

export default LikeSchema;
