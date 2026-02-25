import { Schema } from 'mongoose';
import { MemberType } from '../libs/enums/member.enum';

const AnalyticsEventSchema = new Schema(
	{
		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		memberType: {
			type: String,
			enum: Object.values(MemberType),
			required: true,
		},
		eventName: {
			type: String,
			required: true,
			trim: true,
			maxlength: 120,
		},
		eventPath: {
			type: String,
			trim: true,
			maxlength: 500,
		},
		payload: {
			type: String,
			maxlength: 8000,
		},
		source: {
			type: String,
			trim: true,
			maxlength: 50,
			default: 'web',
		},
		userAgent: {
			type: String,
			trim: true,
			maxlength: 500,
		},
	},
	{
		timestamps: true,
		collection: 'analytics_events',
	},
);

AnalyticsEventSchema.index({ memberId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ eventName: 1, createdAt: -1 });

export default AnalyticsEventSchema;
