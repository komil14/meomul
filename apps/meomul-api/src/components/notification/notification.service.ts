import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { NotificationInput } from '../../libs/dto/notification/notification.input';
import { NotificationDto } from '../../libs/dto/notification/notification';
import { NotificationType } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { NotificationDocument } from '../../libs/types/notification';
import { toNotificationDto } from '../../libs/types/notification';

@Injectable()
export class NotificationService {
	constructor(@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>) {}

	/**
	 * Create a notification
	 */
	public async createNotification(input: NotificationInput): Promise<NotificationDto> {
		const notification = await this.notificationModel.create({
			userId: input.userId,
			type: input.type,
			title: input.title,
			message: input.message,
			link: input.link,
			read: false,
		});

		return toNotificationDto(notification);
	}

	/**
	 * Get all notifications for current user
	 */
	public async getMyNotifications(currentMember: MemberJwtPayload, unreadOnly?: boolean): Promise<NotificationDto[]> {
		const filter: any = {
			userId: currentMember._id,
		};

		if (unreadOnly) {
			filter.read = false;
		}

		const notifications = await this.notificationModel.find(filter).sort({ createdAt: -1 }).exec();

		return notifications.map(toNotificationDto);
	}

	/**
	 * Get notification by ID
	 */
	public async getNotification(notificationId: string, currentMember: MemberJwtPayload): Promise<NotificationDto> {
		const notification = await this.notificationModel.findById(notificationId).exec();

		if (!notification) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Ensure user can only access their own notifications
		if (notification.userId.toString() !== currentMember._id) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toNotificationDto(notification);
	}

	/**
	 * Mark notification as read
	 */
	public async markAsRead(notificationId: string, currentMember: MemberJwtPayload): Promise<NotificationDto> {
		const notification = await this.notificationModel.findById(notificationId).exec();

		if (!notification) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Ensure user can only update their own notifications
		if (notification.userId.toString() !== currentMember._id) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		notification.read = true;
		await notification.save();

		return toNotificationDto(notification);
	}

	/**
	 * Mark all notifications as read for current user
	 */
	public async markAllAsRead(currentMember: MemberJwtPayload): Promise<number> {
		const result = await this.notificationModel
			.updateMany(
				{
					userId: currentMember._id,
					read: false,
				},
				{
					$set: { read: true },
				},
			)
			.exec();

		return result.modifiedCount;
	}

	/**
	 * Delete notification
	 */
	public async deleteNotification(notificationId: string, currentMember: MemberJwtPayload): Promise<boolean> {
		const notification = await this.notificationModel.findById(notificationId).exec();

		if (!notification) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Ensure user can only delete their own notifications
		if (notification.userId.toString() !== currentMember._id) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		await this.notificationModel.deleteOne({ _id: notificationId }).exec();
		return true;
	}

	/**
	 * Get unread notification count for current user
	 */
	public async getUnreadCount(currentMember: MemberJwtPayload): Promise<number> {
		return this.notificationModel
			.countDocuments({
				userId: currentMember._id,
				read: false,
			})
			.exec();
	}

	/**
	 * Delete all notifications for a user (cleanup when user is deleted)
	 */
	public async deleteNotificationsForUser(userId: string): Promise<void> {
		await this.notificationModel
			.deleteMany({
				userId,
			})
			.exec();
	}
}
