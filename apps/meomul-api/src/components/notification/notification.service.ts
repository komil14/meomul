import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { NotificationInput } from '../../libs/dto/notification/notification.input';
import { NotificationDto } from '../../libs/dto/notification/notification';
import { NotificationsDto } from '../../libs/dto/common/notifications';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { NotificationType } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload, MemberDocument } from '../../libs/types/member';
import type { NotificationDocument } from '../../libs/types/notification';
import { toNotificationDto } from '../../libs/types/notification';
import { NotificationGateway } from '../../socket/notification.gateway';

@Injectable()
export class NotificationService {
	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly notificationGateway: NotificationGateway,
	) {}

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
	 * Get all notifications (admin only)
	 */
	public async getAllNotificationsAdmin(input: PaginationInput): Promise<NotificationsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const [list, total] = await Promise.all([
			this.notificationModel
				.find()
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.notificationModel.countDocuments().exec(),
		]);

		return {
			list: list.map(toNotificationDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get subscription request notifications (admin only)
	 */
	public async getSubscriptionRequests(): Promise<NotificationDto[]> {
		const notifications = await this.notificationModel
			.find({ type: NotificationType.SUBSCRIPTION_REQUEST })
			.sort({ createdAt: -1 })
			.exec();

		return notifications.map(toNotificationDto);
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

	/**
	 * Send notification to all admin users (persists to DB + WebSocket push)
	 */
	public async notifyAdmins(type: NotificationType, title: string, message: string, link?: string): Promise<void> {
		const admins = await this.memberModel.find({ memberType: MemberType.ADMIN }).select('_id').exec();

		if (admins.length === 0) return;

		// Create notifications for all admins in bulk
		const notifications = await this.notificationModel.insertMany(
			admins.map((admin) => ({
				userId: admin._id,
				type,
				title,
				message,
				link,
				read: false,
			})),
		);

		// Push real-time via WebSocket
		for (const admin of admins) {
			this.notificationGateway.sendToUser(String(admin._id), {
				type: 'SYSTEM',
				title,
				message,
				data: { notificationType: type, link },
				timestamp: new Date(),
			});
		}

		console.log(`Admin notification sent: ${title} (${admins.length} admins)`);
	}
}
