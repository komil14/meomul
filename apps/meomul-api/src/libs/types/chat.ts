import type { Document, Types } from 'mongoose';
import { ChatDto, MessageDto } from '../dto/chat/chat';
import { ChatScope, ChatStatus, MessageType, SenderType } from '../enums/common.enum';

export interface MessageSubDocument {
	_id?: Types.ObjectId;
	senderId: Types.ObjectId;
	senderType: SenderType;
	messageType: MessageType;
	content?: string;
	imageUrl?: string;
	fileUrl?: string;
	timestamp: Date;
	read: boolean;
}

export interface ChatDocument extends Document {
	_id: Types.ObjectId;
	guestId: Types.ObjectId;
	hotelId?: Types.ObjectId;
	chatScope: ChatScope;
	assignedAgentId?: Types.ObjectId;
	bookingId?: Types.ObjectId;
	supportTopic?: string;
	sourcePath?: string;
	messages: MessageSubDocument[];
	chatStatus: ChatStatus;
	unreadGuestMessages: number;
	unreadAgentMessages: number;
	lastMessageAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

export function toMessageDto(msg: MessageSubDocument): MessageDto {
	return {
		senderId: msg.senderId as unknown as MessageDto['senderId'],
		senderType: msg.senderType,
		messageType: msg.messageType,
		content: msg.content,
		imageUrl: msg.imageUrl,
		fileUrl: msg.fileUrl,
		timestamp: msg.timestamp,
		read: msg.read,
	};
}

function normalizeChatScope(doc: ChatDocument): ChatScope {
	if (doc.chatScope === ChatScope.HOTEL || doc.chatScope === ChatScope.SUPPORT) {
		return doc.chatScope;
	}

	return doc.hotelId ? ChatScope.HOTEL : ChatScope.SUPPORT;
}

export function toChatDto(doc: ChatDocument): ChatDto {
	return {
		_id: doc._id as unknown as ChatDto['_id'],
		guestId: doc.guestId as unknown as ChatDto['guestId'],
		hotelId: doc.hotelId as unknown as ChatDto['hotelId'],
		chatScope: normalizeChatScope(doc),
		assignedAgentId: doc.assignedAgentId as unknown as ChatDto['assignedAgentId'],
		bookingId: doc.bookingId as unknown as ChatDto['bookingId'],
		supportTopic: doc.supportTopic,
		sourcePath: doc.sourcePath,
		messages: doc.messages.map(toMessageDto),
		chatStatus: doc.chatStatus,
		unreadGuestMessages: doc.unreadGuestMessages,
		unreadAgentMessages: doc.unreadAgentMessages,
		lastMessageAt: doc.lastMessageAt,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
