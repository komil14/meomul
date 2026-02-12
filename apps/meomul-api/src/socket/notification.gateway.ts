import {
	WebSocketGateway,
	WebSocketServer,
	SubscribeMessage,
	OnGatewayConnection,
	OnGatewayDisconnect,
	ConnectedSocket,
	MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

interface NotificationPayload {
	type: 'BOOKING' | 'PAYMENT' | 'REVIEW' | 'HOTEL' | 'SYSTEM';
	title: string;
	message: string;
	data?: Record<string, unknown>;
	timestamp: Date;
}

interface UserSession {
	socketId: string;
	userId: string;
	joinedAt: Date;
}

@Injectable()
@WebSocketGateway({
	cors: {
		origin: '*',
		credentials: true,
	},
	namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private userSessions: Map<string, UserSession> = new Map();
	private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

	async handleConnection(client: Socket) {
		console.log(`Notification Client Connected: ${client.id}`);
	}

	async handleDisconnect(client: Socket) {
		console.log(`Notification Client Disconnected: ${client.id}`);

		// Remove user session
		const session = this.userSessions.get(client.id);
		if (session) {
			const userSockets = this.userSocketMap.get(session.userId);
			if (userSockets) {
				userSockets.delete(client.id);
				if (userSockets.size === 0) {
					this.userSocketMap.delete(session.userId);
				}
			}
			this.userSessions.delete(client.id);
		}
	}

	/**
	 * User authenticates and joins their notification channel
	 */
	@SubscribeMessage('authenticate')
	async handleAuthenticate(@ConnectedSocket() client: Socket, @MessageBody() data: { userId: string }) {
		try {
			const { userId } = data;

			if (!userId) {
				return {
					success: false,
					error: 'User ID is required',
				};
			}

			// Join user-specific room
			client.join(`user:${userId}`);

			// Store session
			this.userSessions.set(client.id, {
				socketId: client.id,
				userId,
				joinedAt: new Date(),
			});

			// Update user socket map
			if (!this.userSocketMap.has(userId)) {
				this.userSocketMap.set(userId, new Set());
			}
			this.userSocketMap.get(userId)!.add(client.id);

			console.log(`User ${userId} authenticated on socket ${client.id}`);

			return {
				success: true,
				userId,
				message: 'Successfully authenticated',
			};
		} catch (error) {
			console.error('Error authenticating user:', error);
			return {
				success: false,
				error: 'Failed to authenticate',
			};
		}
	}

	/**
	 * User marks notification as read
	 */
	@SubscribeMessage('markAsRead')
	async handleMarkAsRead(@MessageBody() data: { notificationId: string }) {
		try {
			const { notificationId } = data;

			// Here you would update the notification status in the database
			// For now, we'll just acknowledge the action

			return {
				success: true,
				notificationId,
				message: 'Notification marked as read',
			};
		} catch (error) {
			console.error('Error marking notification as read:', error);
			return {
				success: false,
				error: 'Failed to mark notification as read',
			};
		}
	}

	/**
	 * Send notification to a specific user
	 */
	public sendToUser(userId: string, notification: NotificationPayload): void {
		this.server.to(`user:${userId}`).emit('notification', {
			...notification,
			timestamp: new Date(),
		});

		console.log(`Notification sent to user ${userId}:`, notification.title);
	}

	/**
	 * Send notification to multiple users
	 */
	public sendToUsers(userIds: string[], notification: NotificationPayload): void {
		userIds.forEach((userId) => {
			this.sendToUser(userId, notification);
		});
	}

	/**
	 * Broadcast notification to all connected users
	 */
	public broadcast(notification: NotificationPayload): void {
		this.server.emit('notification', {
			...notification,
			timestamp: new Date(),
		});

		console.log('Notification broadcasted to all users:', notification.title);
	}

	/**
	 * Send booking notification
	 */
	public notifyBookingCreated(userId: string, bookingData: Record<string, unknown>): void {
		this.sendToUser(userId, {
			type: 'BOOKING',
			title: 'Booking Confirmed',
			message: 'Your booking has been successfully created',
			data: bookingData,
			timestamp: new Date(),
		});
	}

	/**
	 * Send payment notification
	 */
	public notifyPaymentReceived(userId: string, paymentData: Record<string, unknown>): void {
		this.sendToUser(userId, {
			type: 'PAYMENT',
			title: 'Payment Received',
			message: 'Your payment has been successfully processed',
			data: paymentData,
			timestamp: new Date(),
		});
	}

	/**
	 * Send booking status update notification
	 */
	public notifyBookingStatusUpdate(
		userId: string,
		status: string,
		bookingData: Record<string, unknown>,
	): void {
		const statusMessages: Record<string, string> = {
			CONFIRMED: 'Your booking has been confirmed',
			CHECKED_IN: 'Check-in successful. Enjoy your stay!',
			CHECKED_OUT: 'Thank you for staying with us!',
			CANCELLED: 'Your booking has been cancelled',
		};

		this.sendToUser(userId, {
			type: 'BOOKING',
			title: `Booking ${status}`,
			message: statusMessages[status] || `Booking status updated to ${status}`,
			data: bookingData,
			timestamp: new Date(),
		});
	}

	/**
	 * Send hotel notification to agent
	 */
	public notifyHotelAgent(agentId: string, notification: NotificationPayload): void {
		this.sendToUser(agentId, notification);
	}

	/**
	 * Get online users count
	 */
	public getOnlineUsersCount(): number {
		return this.userSocketMap.size;
	}

	/**
	 * Check if user is online
	 */
	public isUserOnline(userId: string): boolean {
		return this.userSocketMap.has(userId);
	}

	/**
	 * Get user's active socket count
	 */
	public getUserSocketCount(userId: string): number {
		return this.userSocketMap.get(userId)?.size || 0;
	}
}
