import { Schema, model, Document, Types } from 'mongoose';
import { NotificationType } from '../libs/enums/common.enum';

const NotificationSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},
		type: {
			type: String,
			enum: Object.values(NotificationType),
			required: true,
		},
		title: {
			type: String,
			required: true,
		},
		message: {
			type: String,
			required: true,
		},
		link: String,
		read: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
		collection: 'notifications',
	},
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export default NotificationSchema;
