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

ViewSchema.index({ viewRefId: 1, memberId: 1 }, { unique: true });

export default ViewSchema;
