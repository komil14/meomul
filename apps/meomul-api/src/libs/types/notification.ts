import type { Document, Types } from 'mongoose';
import { NotificationDto } from '../dto/notification/notification';
import { NotificationType } from '../enums/common.enum';

export interface NotificationDocument extends Document {
	_id: Types.ObjectId;
	userId: Types.ObjectId;
	type: NotificationType;
	title: string;
	message: string;
	link?: string;
	read: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export function toNotificationDto(doc: NotificationDocument): NotificationDto {
	return {
		_id: doc._id as unknown as any,
		userId: doc.userId as unknown as any,
		type: doc.type,
		title: doc.title,
		message: doc.message,
		link: doc.link,
		read: doc.read,
		createdAt: doc.createdAt,
	};
}
