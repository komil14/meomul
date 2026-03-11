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
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '../components/auth/auth.service';
import { MemberType } from '../libs/enums/member.enum';

const resolveSocketOrigins = (): string[] => {
	const envList = (process.env.SOCKET_CORS_ORIGINS ?? '')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	const frontendUrl = process.env.FRONTEND_URL?.trim();

	return Array.from(
		new Set(['http://localhost:3000', 'http://localhost:3001', ...(frontendUrl ? [frontendUrl] : []), ...envList]),
	);
};

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
	memberType: MemberType;
	joinedAt: Date;
}

@Injectable()
@WebSocketGateway({
	cors: {
		origin: resolveSocketOrigins(),
		credentials: true,
	},
	namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(NotificationGateway.name);

	@WebSocketServer()
	server: Server;

	constructor(private readonly authService: AuthService) {}

	private userSessions: Map<string, UserSession> = new Map();
	private userSocketMap: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
	private authTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	private static readonly AUTH_TIMEOUT_MS = 5_000;

	async handleConnection(client: Socket) {
		this.logger.log(`Notification Client Connected: ${client.id}`);

		// Attempt handshake-level auth
		const handshakeToken = this.extractToken(client);
		if (handshakeToken) {
			try {
				const authMember = await this.authService.verifyToken(handshakeToken);
				if (authMember?._id) {
					this.registerSession(client, authMember._id, authMember.memberType);
					return;
				}
			} catch (error) {
				this.logger.warn(`Handshake auth failed for ${client.id}: ${error}`);
				client.emit('error', { message: 'Invalid authentication token' });
				client.disconnect(true);
				return;
			}
		}

		// Grace period for 'authenticate' event
		const timer = setTimeout(() => {
			if (!this.userSessions.has(client.id)) {
				client.emit('error', { message: 'Authentication timeout' });
				client.disconnect(true);
			}
		}, NotificationGateway.AUTH_TIMEOUT_MS);
		this.authTimers.set(client.id, timer);
	}

	handleDisconnect(client: Socket) {
		this.logger.log(`Notification Client Disconnected: ${client.id}`);

		// Clear any pending auth timer
		const timer = this.authTimers.get(client.id);
		if (timer) {
			clearTimeout(timer);
			this.authTimers.delete(client.id);
		}

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
	async handleAuthenticate(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: { token?: string; userId?: string },
	) {
		try {
			// Already authenticated via handshake
			if (this.userSessions.has(client.id)) {
				const session = this.userSessions.get(client.id)!;
				return { success: true, userId: session.userId, message: 'Already authenticated' };
			}

			const rawToken = this.extractToken(client, data?.token);
			if (!rawToken) {
				return {
					success: false,
					error: 'Authentication token is required',
				};
			}

			const authMember = await this.authService.verifyToken(rawToken);
			const userId = authMember._id;
			if (!userId) {
				return {
					success: false,
					error: 'Invalid token payload',
				};
			}

			if (data?.userId && data.userId !== userId) {
				return {
					success: false,
					error: 'Token user mismatch',
				};
			}

			this.registerSession(client, userId, authMember.memberType);

			this.logger.log(`User ${userId} authenticated on socket ${client.id}`);

			return {
				success: true,
				userId,
				message: 'Successfully authenticated',
			};
		} catch (error) {
			this.logger.error('Error authenticating user:', error);
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
	handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() data: { notificationId: string }) {
		try {
			const session = this.userSessions.get(client.id);
			if (!session) {
				return {
					success: false,
					error: 'Please authenticate first',
				};
			}

			const { notificationId } = data;

			// Here you would update the notification status in the database
			// For now, we'll just acknowledge the action

			return {
				success: true,
				notificationId,
				message: 'Notification marked as read',
			};
		} catch (error) {
			this.logger.error('Error marking notification as read:', error);
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

		this.logger.log(`Notification sent to user ${userId}: ${notification.title}`);
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

		this.logger.log(`Notification broadcasted to all users: ${notification.title}`);
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
	public notifyBookingStatusUpdate(userId: string, status: string, bookingData: Record<string, unknown>): void {
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

	private extractToken(client: Socket, tokenFromPayload?: string): string | null {
		const cookieHeader = typeof client.handshake.headers.cookie === 'string' ? client.handshake.headers.cookie : null;
		const authHeader =
			typeof client.handshake.headers.authorization === 'string' ? client.handshake.headers.authorization : null;
		const authToken = typeof client.handshake.auth?.token === 'string' ? client.handshake.auth.token : null;
		const cookieToken = this.extractCookieValue(cookieHeader, 'meomul_at');
		const rawToken = tokenFromPayload || authToken || authHeader || cookieToken;
		if (!rawToken) return null;

		if (rawToken.startsWith('Bearer ')) {
			return rawToken.slice(7).trim();
		}

		return rawToken.trim();
	}

	private extractCookieValue(cookieHeader: string | null, key: string): string | null {
		if (!cookieHeader) return null;

		for (const segment of cookieHeader.split(';')) {
			const [rawName, ...rawValueParts] = segment.split('=');
			if (!rawName || rawValueParts.length === 0) continue;
			if (rawName.trim() !== key) continue;

			const rawValue = rawValueParts.join('=').trim();
			if (!rawValue) return null;

			try {
				return decodeURIComponent(rawValue);
			} catch {
				return rawValue;
			}
		}

		return null;
	}

	private registerSession(client: Socket, userId: string, memberType: MemberType): void {
		const timer = this.authTimers.get(client.id);
		if (timer) {
			clearTimeout(timer);
			this.authTimers.delete(client.id);
		}

		client.join(`user:${userId}`);

		this.userSessions.set(client.id, {
			socketId: client.id,
			userId,
			memberType,
			joinedAt: new Date(),
		});

		if (!this.userSocketMap.has(userId)) {
			this.userSocketMap.set(userId, new Set());
		}
		this.userSocketMap.get(userId)!.add(client.id);
	}
}
