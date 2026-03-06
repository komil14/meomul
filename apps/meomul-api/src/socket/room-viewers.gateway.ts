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
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { RoomDocument } from '../libs/types/room';

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

interface ViewerSession {
	socketId: string;
	roomId: string;
	userId?: string;
	viewerSessionId?: string;
	joinedAt: Date;
}

const ROOM_EXISTS_CACHE_TTL_MS = 60_000;

@Injectable()
@WebSocketGateway({
	cors: {
		origin: resolveSocketOrigins(),
		credentials: true,
	},
	namespace: '/room-viewers',
})
export class RoomViewersGateway implements OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(RoomViewersGateway.name);

	@WebSocketServer()
	server: Server;

	private viewerSessions: Map<string, ViewerSession> = new Map();
	private roomExistsCache: Map<string, number> = new Map();

	constructor(@InjectModel('Room') private readonly roomModel: Model<RoomDocument>) {}

	handleConnection(client: Socket) {
		this.logger.log(`Room Viewer Connected: ${client.id}`);
	}

	async handleDisconnect(client: Socket) {
		this.logger.log(`Room Viewer Disconnected: ${client.id}`);

		// Find and remove viewer session
		const session = this.viewerSessions.get(client.id);
		if (session) {
			this.viewerSessions.delete(client.id);

			// Notify other viewers
			this.server.to(`room:${session.roomId}`).emit('viewerCountUpdated', {
				roomId: session.roomId,
				count: await this.getCurrentViewerCount(session.roomId),
			});
		}
	}

	/**
	 * Client joins a room page
	 */
	@SubscribeMessage('joinRoom')
	async handleJoinRoom(
		@ConnectedSocket() client: Socket,
		@MessageBody() data: { roomId: string; userId?: string; viewerSessionId?: string },
	) {
		try {
			const { roomId, userId, viewerSessionId } = data;
			await this.assertRoomExists(roomId);

			// Leave previous room if any
			const previousSession = this.viewerSessions.get(client.id);
			if (previousSession) {
				// Idempotent join: do not increment again when the same socket rejoins the same room.
				if (previousSession.roomId === roomId) {
					const viewerCount = await this.getCurrentViewerCount(roomId);
					return {
						success: true,
						roomId,
						viewerCount,
					};
				}

				const previousRoomId = previousSession.roomId;
				await this.leaveViewerSession(client, previousRoomId);
				this.server.to(`room:${previousRoomId}`).emit('viewerCountUpdated', {
					roomId: previousRoomId,
					count: await this.getCurrentViewerCount(previousRoomId),
				});
			}

			// Join new room
			await client.join(`room:${roomId}`);

			// Store session
			this.viewerSessions.set(client.id, {
				socketId: client.id,
				roomId,
				userId,
				viewerSessionId,
				joinedAt: new Date(),
			});
			this.setClientViewerData(client, roomId, viewerSessionId ?? null);

			// Get updated count
			const viewerCount = await this.getCurrentViewerCount(roomId);

			// Notify all viewers in the room
			this.server.to(`room:${roomId}`).emit('viewerCountUpdated', {
				roomId,
				count: viewerCount,
			});

			return {
				success: true,
				roomId,
				viewerCount,
			};
		} catch (error) {
			console.error('Error joining room:', error);
			return {
				success: false,
				error: 'Failed to join room',
			};
		}
	}

	/**
	 * Client leaves a room page
	 */
	@SubscribeMessage('leaveRoom')
	async handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
		try {
			const session = this.viewerSessions.get(client.id);
			if (!session) {
				return {
					success: true,
					roomId: data.roomId,
					viewerCount: await this.getCurrentViewerCount(data.roomId),
				};
			}

			if (data.roomId && data.roomId !== session.roomId) {
				return {
					success: false,
					error: 'Room mismatch for active viewer session',
				};
			}

			const roomId = session.roomId;
			await this.leaveViewerSession(client, roomId);

			// Get updated count
			const viewerCount = await this.getCurrentViewerCount(roomId);

			// Notify remaining viewers
			this.server.to(`room:${roomId}`).emit('viewerCountUpdated', {
				roomId,
				count: viewerCount,
			});

			return {
				success: true,
				roomId,
				viewerCount,
			};
		} catch (error) {
			console.error('Error leaving room:', error);
			return {
				success: false,
				error: 'Failed to leave room',
			};
		}
	}

	private async leaveViewerSession(client: Socket, roomId: string): Promise<void> {
		await client.leave(`room:${roomId}`);
		this.viewerSessions.delete(client.id);
		this.setClientViewerData(client, null, null);
	}

	/**
	 * Get current viewer count for a room
	 */
	@SubscribeMessage('getViewerCount')
	async handleGetViewerCount(@MessageBody() data: { roomId: string }) {
		try {
			const { roomId } = data;
			await this.assertRoomExists(roomId);
			const count = await this.getCurrentViewerCount(roomId);

			return {
				success: true,
				roomId,
				count,
			};
		} catch (error) {
			console.error('Error getting viewer count:', error);
			return {
				success: false,
				error: 'Failed to get viewer count',
			};
		}
	}

	/**
	 * Get current live viewer count from active gateway sessions.
	 * Uses viewerSessionId when available so refresh/reconnect of the same browser
	 * session does not inflate the count.
	 */
	private async getCurrentViewerCount(roomId: string): Promise<number> {
		const sockets = await this.server.in(`room:${roomId}`).fetchSockets();
		const uniqueViewers = new Set<string>();
		for (const socket of sockets) {
			const socketData = socket.data as Record<string, unknown> | undefined;
			const rawViewerSessionId = socketData?.viewerSessionId;
			const viewerSessionId =
				typeof rawViewerSessionId === 'string' && rawViewerSessionId.trim().length > 0 ? rawViewerSessionId : undefined;

			if (viewerSessionId) {
				uniqueViewers.add(`viewer:${viewerSessionId}`);
				continue;
			}

			uniqueViewers.add(`socket:${socket.id}`);
		}

		return uniqueViewers.size;
	}

	private setClientViewerData(client: Socket, roomId: string | null, viewerSessionId: string | null): void {
		const socketData = client.data as Record<string, unknown>;
		socketData.roomId = roomId;
		socketData.viewerSessionId = viewerSessionId;
	}

	private async assertRoomExists(roomId: string): Promise<void> {
		if (!roomId) {
			throw new Error('roomId is required');
		}

		const now = Date.now();
		const cachedUntil = this.roomExistsCache.get(roomId);
		if (cachedUntil && cachedUntil > now) {
			return;
		}

		const roomExists = await this.roomModel.exists({ _id: roomId }).exec();
		if (!roomExists) {
			throw new Error('Room not found');
		}

		this.roomExistsCache.set(roomId, now + ROOM_EXISTS_CACHE_TTL_MS);
		// Bound cache size to avoid unbounded growth in long-lived processes.
		if (this.roomExistsCache.size > 5000) {
			for (const [cachedRoomId, expiresAt] of this.roomExistsCache.entries()) {
				if (expiresAt <= now) {
					this.roomExistsCache.delete(cachedRoomId);
				}
			}
		}
	}

	/**
	 * Broadcast viewer count update to all clients viewing a room
	 */
	public broadcastViewerCount(roomId: string, count: number): void {
		this.server.to(`room:${roomId}`).emit('viewerCountUpdated', {
			roomId,
			count,
		});
	}
}
