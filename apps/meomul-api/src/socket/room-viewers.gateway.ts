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
	joinedAt: Date;
}

@Injectable()
@WebSocketGateway({
	cors: {
		origin: resolveSocketOrigins(),
		credentials: true,
	},
	namespace: '/room-viewers',
})
export class RoomViewersGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	server: Server;

	private viewerSessions: Map<string, ViewerSession> = new Map();

	constructor(@InjectModel('Room') private readonly roomModel: Model<RoomDocument>) {}

	handleConnection(client: Socket) {
		console.log(`Room Viewer Connected: ${client.id}`);
	}

	async handleDisconnect(client: Socket) {
		console.log(`Room Viewer Disconnected: ${client.id}`);

		// Find and remove viewer session
		const session = this.viewerSessions.get(client.id);
		if (session) {
			await this.decrementViewerCount(session.roomId);
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
	async handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string; userId?: string }) {
		try {
			const { roomId, userId } = data;
			await this.assertRoomExists(roomId);

			// Leave previous room if any
			const previousSession = this.viewerSessions.get(client.id);
			if (previousSession) {
				await this.leaveViewerSession(client, previousSession.roomId);
			}

			// Join new room
			await client.join(`room:${roomId}`);

			// Increment viewer count
			await this.incrementViewerCount(roomId);

			// Store session
			this.viewerSessions.set(client.id, {
				socketId: client.id,
				roomId,
				userId,
				joinedAt: new Date(),
			});

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
					viewerCount: 0,
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
		await this.decrementViewerCount(roomId);
		this.viewerSessions.delete(client.id);
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
	 * Increment viewer count in database
	 */
	private async incrementViewerCount(roomId: string): Promise<void> {
		try {
			await this.roomModel.findByIdAndUpdate(roomId, { $inc: { currentViewers: 1 } }).exec();
		} catch (error) {
			console.error('Error incrementing viewer count:', error);
		}
	}

	/**
	 * Decrement viewer count in database
	 */
	private async decrementViewerCount(roomId: string): Promise<void> {
		try {
			await this.roomModel
				.findByIdAndUpdate(roomId, {
					$inc: { currentViewers: -1 },
					$max: { currentViewers: 0 },
				})
				.exec();
		} catch (error) {
			console.error('Error decrementing viewer count:', error);
		}
	}

	/**
	 * Get current viewer count from database
	 */
	private async getCurrentViewerCount(roomId: string): Promise<number> {
		try {
			const room = await this.roomModel.findById(roomId).exec();
			return room?.currentViewers || 0;
		} catch (error) {
			console.error('Error getting current viewer count:', error);
			return 0;
		}
	}

	private async assertRoomExists(roomId: string): Promise<void> {
		if (!roomId) {
			throw new Error('roomId is required');
		}

		const roomExists = await this.roomModel.exists({ _id: roomId }).exec();
		if (!roomExists) {
			throw new Error('Room not found');
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
