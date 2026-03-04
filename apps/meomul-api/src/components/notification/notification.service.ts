import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
	private readonly logger = new Logger(NotificationService.name);

	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly notificationGateway: NotificationGateway,
	) {}

	/**
	 * Create a notification (DB only, no real-time push)
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
	 * Create a notification AND push it in real-time via WebSocket.
	 * Use this for user-facing notifications that should appear instantly.
	 */
	public async createAndPush(
		input: NotificationInput,
		wsType: 'BOOKING' | 'PAYMENT' | 'REVIEW' | 'HOTEL' | 'SYSTEM' = 'SYSTEM',
	): Promise<NotificationDto> {
		const dto = await this.createNotification(input);

		// Real-time push (fire-and-forget)
		try {
			this.notificationGateway.sendToUser(input.userId, {
				type: wsType,
				title: input.title,
				message: input.message,
				data: { notificationType: input.type, link: input.link },
				timestamp: new Date(),
			});
		} catch (err) {
			this.logger.warn(`WS push failed for user ${input.userId}: ${err}`);
		}

		return dto;
	}

	/**
	 * Get all notifications for current user
	 */
	public async getMyNotifications(currentMember: MemberJwtPayload, unreadOnly?: boolean): Promise<NotificationDto[]> {
		const notifications = await this.notificationModel
			.find({
				userId: currentMember._id,
				...(unreadOnly ? { read: false } : {}),
			})
			.sort({ createdAt: -1 })
			.exec();

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

		const dtos = list.map(toNotificationDto);

		// Attach user nicknames
		const userIds = Array.from(new Set(dtos.map((d) => String(d.userId))));
		const members = await this.memberModel
			.find({ _id: { $in: userIds } })
			.select({ _id: 1, memberNick: 1 })
			.lean<{ _id: string; memberNick?: string }[]>()
			.exec();
		const nickById = new Map(members.map((m) => [String(m._id), m.memberNick]));

		return {
			list: dtos.map((d) => ({ ...d, userNick: nickById.get(String(d.userId)) })),
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
	 * Check if a member already has a pending subscription request
	 */
	public async hasPendingSubscriptionRequest(memberId: string): Promise<boolean> {
		const count = await this.notificationModel
			.countDocuments({
				type: NotificationType.SUBSCRIPTION_REQUEST,
				link: `/admin/members/${memberId}`,
			})
			.exec();
		return count > 0;
	}

	/**
	 * Get the requested tier from a pending subscription request (if any)
	 */
	public async getPendingSubscriptionTier(memberId: string): Promise<string | null> {
		const notification = await this.notificationModel
			.findOne({
				type: NotificationType.SUBSCRIPTION_REQUEST,
				link: `/admin/members/${memberId}`,
			})
			.sort({ createdAt: -1 })
			.exec();
		if (!notification) return null;
		const match = notification.message.match(/requested (\w+) subscription/i);
		return match?.[1]?.toUpperCase() ?? null;
	}

	/**
	 * Delete subscription request notifications for a member (after approve/deny)
	 */
	public async deleteSubscriptionRequestsForMember(memberId: string): Promise<void> {
		await this.notificationModel
			.deleteMany({
				type: NotificationType.SUBSCRIPTION_REQUEST,
				link: `/admin/members/${memberId}`,
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

	/**
	 * Send notification to all admin users (persists to DB + WebSocket push)
	 */
	public async notifyAdmins(type: NotificationType, title: string, message: string, link?: string): Promise<void> {
		const admins = await this.memberModel
			.find({ memberType: { $in: [MemberType.ADMIN, MemberType.ADMIN_OPERATOR] } })
			.select('_id')
			.exec();

		if (admins.length === 0) return;

		// Create notifications for all admins in bulk
		await this.notificationModel.insertMany(
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

		this.logger.log(`Admin notification sent: ${title} (${admins.length} admins)`);
	}
}
