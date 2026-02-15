import { Schema } from 'mongoose';
import { ViewGroup } from '../libs/enums/common.enum';

const ViewSchema = new Schema(
	{
		viewGroup: {
			type: String,
			enum: Object.values(ViewGroup),
			required: true,
		},
		viewRefId: {
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
		collection: 'views',
	},
);

// Unique constraint: one view per member per item
ViewSchema.index({ viewRefId: 1, memberId: 1, viewGroup: 1 }, { unique: true });

// Recommendation: per-user hotel views lookup
ViewSchema.index({ viewGroup: 1, memberId: 1, createdAt: -1 });

// Recommendation: trending aggregation (recent views across all users)
ViewSchema.index({ viewGroup: 1, createdAt: -1 });

export default ViewSchema;
