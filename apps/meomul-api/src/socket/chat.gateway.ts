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
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MemberType } from '../libs/enums/member.enum';
import type { ChatDocument } from '../libs/types/chat';
import type { HotelDocument } from '../libs/types/hotel';
import { AuthService } from '../components/auth/auth.service';

interface UserSession {
	socketId: string;
	userId: string;
	memberType: MemberType;
	joinedAt: Date;
}

interface ChatMessagePayload {
	chatId: string;
	message: {
		senderId: string;
		senderType: string;
		messageType: string;
		content?: string;
		imageUrl?: string;
		fileUrl?: string;
		timestamp: Date;
		read: boolean;
	};
}

@Injectable()
@WebSocketGateway({
	cors: {
		origin: '*',
		credentials: true,
	},
	namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	constructor(
		private readonly authService: AuthService,
		@InjectModel('Chat') private readonly chatModel: Model<ChatDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
	) {}

	private userSessions: Map<string, UserSession> = new Map();
	private userSocketMap: Map<string, Set<string>> = new Map();
	private socketChatMap: Map<string, Set<string>> = new Map(); // socketId -> Set of chatIds

	async handleConnection(client: Socket) {
		console.log(`Chat Client Connected: ${client.id}`);
	}

	async handleDisconnect(client: Socket) {
		console.log(`Chat Client Disconnected: ${client.id}`);

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

		this.socketChatMap.delete(client.id);
	}

	/**
	 * Client authenticates and joins their personal room
	 */
	@SubscribeMessage('authenticate')
	async handleAuthenticate(@ConnectedSocket() client: Socket, @MessageBody() data: { token?: string; userId?: string }) {
		try {
			const rawToken = this.extractToken(client, data?.token);
			if (!rawToken) {
				return { success: false, error: 'Authentication token is required' };
			}

			const authMember = await this.authService.verifyToken(rawToken);
			const userId = authMember._id;
			if (!userId) {
				return { success: false, error: 'Invalid token payload' };
			}

			if (data?.userId && data.userId !== userId) {
				return { success: false, error: 'Token user mismatch' };
			}

			client.join(`user:${userId}`);

			this.userSessions.set(client.id, {
				socketId: client.id,
				userId,
				memberType: authMember.memberType,
				joinedAt: new Date(),
			});

			if (!this.userSocketMap.has(userId)) {
				this.userSocketMap.set(userId, new Set());
			}
			this.userSocketMap.get(userId)!.add(client.id);

			console.log(`Chat user ${userId} authenticated on socket ${client.id}`);

			return { success: true, userId, message: 'Authenticated to chat' };
		} catch (error) {
			console.error('Error authenticating chat user:', error);
			return { success: false, error: 'Failed to authenticate' };
		}
	}

	/**
	 * Client joins a specific chat room
	 */
	@SubscribeMessage('joinChat')
	async handleJoinChat(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
		try {
			const { chatId } = data;
			const session = this.userSessions.get(client.id);

			if (!session) {
				return { success: false, error: 'Please authenticate first' };
			}

			const allowed = await this.canAccessChat(session, chatId);
			if (!allowed) {
				return { success: false, error: 'Not allowed to join this chat' };
			}

			client.join(`chat:${chatId}`);

			if (!this.socketChatMap.has(client.id)) {
				this.socketChatMap.set(client.id, new Set());
			}
			this.socketChatMap.get(client.id)!.add(chatId);

			console.log(`User ${session.userId} joined chat ${chatId}`);

			return { success: true, chatId, message: 'Joined chat room' };
		} catch (error) {
			console.error('Error joining chat:', error);
			return { success: false, error: 'Failed to join chat' };
		}
	}

	/**
	 * Client leaves a chat room
	 */
	@SubscribeMessage('leaveChat')
	async handleLeaveChat(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
		try {
			const { chatId } = data;

			client.leave(`chat:${chatId}`);

			const chatIds = this.socketChatMap.get(client.id);
			if (chatIds) {
				chatIds.delete(chatId);
			}

			return { success: true, chatId, message: 'Left chat room' };
		} catch (error) {
			console.error('Error leaving chat:', error);
			return { success: false, error: 'Failed to leave chat' };
		}
	}

	/**
	 * Client is typing in a chat
	 */
	@SubscribeMessage('typing')
	async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
		const session = this.userSessions.get(client.id);
		if (!session) return;
		if (!this.socketChatMap.get(client.id)?.has(data.chatId)) return;

		client.to(`chat:${data.chatId}`).emit('userTyping', {
			chatId: data.chatId,
			userId: session.userId,
			timestamp: new Date(),
		});
	}

	/**
	 * Client stopped typing
	 */
	@SubscribeMessage('stopTyping')
	async handleStopTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
		const session = this.userSessions.get(client.id);
		if (!session) return;
		if (!this.socketChatMap.get(client.id)?.has(data.chatId)) return;

		client.to(`chat:${data.chatId}`).emit('userStopTyping', {
			chatId: data.chatId,
			userId: session.userId,
		});
	}

	private extractToken(client: Socket, tokenFromPayload?: string): string | null {
		const authHeader = typeof client.handshake.headers.authorization === 'string'
			? client.handshake.headers.authorization
			: null;
		const authToken = typeof client.handshake.auth?.token === 'string'
			? client.handshake.auth.token
			: null;
		const rawToken = tokenFromPayload || authToken || authHeader;
		if (!rawToken) return null;

		if (rawToken.startsWith('Bearer ')) {
			return rawToken.slice(7).trim();
		}

		return rawToken.trim();
	}

	private async canAccessChat(session: UserSession, chatId: string): Promise<boolean> {
		const chat = await this.chatModel
			.findById(chatId)
			.select('guestId assignedAgentId hotelId')
			.exec();

		if (!chat) return false;

		if (String(chat.guestId) === session.userId) {
			return true;
		}

		if (chat.assignedAgentId && String(chat.assignedAgentId) === session.userId) {
			return true;
		}

		if (session.memberType === MemberType.ADMIN) {
			return true;
		}

		if (session.memberType === MemberType.AGENT) {
			const hotel = await this.hotelModel.findById(chat.hotelId).select('memberId').exec();
			return !!hotel && String(hotel.memberId) === session.userId;
		}

		return false;
	}

	// --- Public methods called from ChatService ---

	/**
	 * Emit new message to all participants in a chat room
	 */
	public emitNewMessage(chatId: string, payload: ChatMessagePayload['message']): void {
		this.server.to(`chat:${chatId}`).emit('newMessage', {
			chatId,
			message: payload,
		});
	}

	/**
	 * Emit chat claimed event (agent assigned)
	 */
	public emitChatClaimed(chatId: string, agentId: string): void {
		this.server.to(`chat:${chatId}`).emit('chatClaimed', {
			chatId,
			agentId,
			timestamp: new Date(),
		});
	}

	/**
	 * Emit chat closed event
	 */
	public emitChatClosed(chatId: string, closedBy: string): void {
		this.server.to(`chat:${chatId}`).emit('chatClosed', {
			chatId,
			closedBy,
			timestamp: new Date(),
		});
	}

	/**
	 * Emit messages read event
	 */
	public emitMessagesRead(chatId: string, readBy: string): void {
		this.server.to(`chat:${chatId}`).emit('messagesRead', {
			chatId,
			readBy,
			timestamp: new Date(),
		});
	}

	/**
	 * Send event to a specific user (by userId, across all their sockets)
	 */
	public sendToUser(userId: string, event: string, data: any): void {
		this.server.to(`user:${userId}`).emit(event, data);
	}

	/**
	 * Check if a user is connected to the chat namespace
	 */
	public isUserOnline(userId: string): boolean {
		return this.userSocketMap.has(userId);
	}
}
