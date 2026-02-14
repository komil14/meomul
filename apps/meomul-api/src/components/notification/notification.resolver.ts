import { Args, Mutation, Query, Resolver, Int } from '@nestjs/graphql';
import { NotificationDto } from '../../libs/dto/notification/notification';
import { NotificationsDto } from '../../libs/dto/common/notifications';
import { NotificationInput } from '../../libs/dto/notification/notification.input';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { NotificationService } from './notification.service';

@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	/**
	 * Create notification (admin/system only)
	 */
	@Mutation(() => NotificationDto)
	@Roles(MemberType.ADMIN)
	public async createNotification(@Args('input') input: NotificationInput): Promise<NotificationDto> {
		try {
			console.log('Mutation createNotification', input.userId, input.type);
			return this.notificationService.createNotification(input);
		} catch (error) {
			console.error('Mutation createNotification failed', input.userId, input.type, error);
			throw error;
		}
	}

	/**
	 * Get current user's notifications
	 */
	@Query(() => [NotificationDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyNotifications(
		@CurrentMember() currentMember: any,
		@Args('unreadOnly', { type: () => Boolean, nullable: true }) unreadOnly?: boolean,
	): Promise<NotificationDto[]> {
		try {
			console.log('Query getMyNotifications', currentMember?._id ?? 'unknown', unreadOnly);
			return this.notificationService.getMyNotifications(currentMember, unreadOnly);
		} catch (error) {
			console.error('Query getMyNotifications failed', currentMember?._id ?? 'unknown', unreadOnly, error);
			throw error;
		}
	}

	/**
	 * Get single notification
	 */
	@Query(() => NotificationDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getNotification(
		@CurrentMember() currentMember: any,
		@Args('notificationId') notificationId: string,
	): Promise<NotificationDto> {
		try {
			console.log('Query getNotification', currentMember?._id ?? 'unknown', notificationId);
			return this.notificationService.getNotification(notificationId, currentMember);
		} catch (error) {
			console.error('Query getNotification failed', currentMember?._id ?? 'unknown', notificationId, error);
			throw error;
		}
	}

	/**
	 * Mark notification as read
	 */
	@Mutation(() => NotificationDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async markAsRead(
		@CurrentMember() currentMember: any,
		@Args('notificationId') notificationId: string,
	): Promise<NotificationDto> {
		try {
			console.log('Mutation markAsRead', currentMember?._id ?? 'unknown', notificationId);
			return this.notificationService.markAsRead(notificationId, currentMember);
		} catch (error) {
			console.error('Mutation markAsRead failed', currentMember?._id ?? 'unknown', notificationId, error);
			throw error;
		}
	}

	/**
	 * Mark all notifications as read
	 */
	@Mutation(() => Int)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async markAllAsRead(@CurrentMember() currentMember: any): Promise<number> {
		try {
			console.log('Mutation markAllAsRead', currentMember?._id ?? 'unknown');
			return this.notificationService.markAllAsRead(currentMember);
		} catch (error) {
			console.error('Mutation markAllAsRead failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Delete notification
	 */
	@Mutation(() => Boolean)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async deleteNotification(
		@CurrentMember() currentMember: any,
		@Args('notificationId') notificationId: string,
	): Promise<boolean> {
		try {
			console.log('Mutation deleteNotification', currentMember?._id ?? 'unknown', notificationId);
			return this.notificationService.deleteNotification(notificationId, currentMember);
		} catch (error) {
			console.error('Mutation deleteNotification failed', currentMember?._id ?? 'unknown', notificationId, error);
			throw error;
		}
	}

	/**
	 * Get unread notification count
	 */
	@Query(() => Int)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getUnreadCount(@CurrentMember() currentMember: any): Promise<number> {
		try {
			console.log('Query getUnreadCount', currentMember?._id ?? 'unknown');
			return this.notificationService.getUnreadCount(currentMember);
		} catch (error) {
			console.error('Query getUnreadCount failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Get all notifications (admin only)
	 */
	@Query(() => NotificationsDto)
	@Roles(MemberType.ADMIN)
	public async getAllNotificationsAdmin(@Args('input') input: PaginationInput): Promise<NotificationsDto> {
		try {
			console.log('Query getAllNotificationsAdmin');
			return this.notificationService.getAllNotificationsAdmin(input);
		} catch (error) {
			console.error('Query getAllNotificationsAdmin failed', error);
			throw error;
		}
	}
}
