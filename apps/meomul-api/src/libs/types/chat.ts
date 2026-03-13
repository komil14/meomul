import type { Document, Types } from 'mongoose';
import { ChatDto, MessageDto } from '../dto/chat/chat';
import { ChatScope, ChatStatus, MessageType, SenderType } from '../enums/common.enum';
import { MemberType } from '../enums/member.enum';
import type { MemberJwtPayload } from './member';

export interface MessageSubDocument {
	_id?: Types.ObjectId;
	senderId: Types.ObjectId;
	senderType: SenderType;
	messageType: MessageType;
	content?: string;
	imageUrl?: string;
	fileUrl?: string;
	timestamp: Date;
	readByMemberIds?: Types.ObjectId[];
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

function stringifyObjectId(value?: Types.ObjectId | string | null): string {
	return value ? String(value) : '';
}

function getReadByMemberIds(msg: MessageSubDocument): string[] {
	return (msg.readByMemberIds ?? []).map((id) => String(id));
}

export function hasMemberReadMessage(msg: MessageSubDocument, memberId: string): boolean {
	if (!memberId) {
		return false;
	}

	if (stringifyObjectId(msg.senderId) === memberId) {
		return true;
	}

	if (getReadByMemberIds(msg).includes(memberId)) {
		return true;
	}

	// Fallback for legacy messages created before per-member read tracking.
	return msg.read === true;
}

export function countUnreadMessagesForMember(
	messages: MessageSubDocument[],
	memberId: string,
	incomingSenderType: SenderType,
): number {
	return messages.reduce((total, message) => {
		if (message.senderType !== incomingSenderType) {
			return total;
		}

		return hasMemberReadMessage(message, memberId) ? total : total + 1;
	}, 0);
}

function hasOtherSideReadMessage(msg: MessageSubDocument, chat: ChatDocument, currentMember: MemberJwtPayload): boolean {
	const currentMemberId = currentMember._id;
	const currentIsGuest = stringifyObjectId(chat.guestId) === currentMemberId;

	if (stringifyObjectId(msg.senderId) !== currentMemberId) {
		return hasMemberReadMessage(msg, currentMemberId);
	}

	if (currentIsGuest) {
		return getReadByMemberIds(msg).some((readerId) => readerId !== currentMemberId) || msg.read === true;
	}

	return hasMemberReadMessage(msg, stringifyObjectId(chat.guestId));
}

export function toMessageDto(msg: MessageSubDocument, chat?: ChatDocument, currentMember?: MemberJwtPayload): MessageDto {
	return {
		senderId: msg.senderId as unknown as MessageDto['senderId'],
		senderType: msg.senderType,
		messageType: msg.messageType,
		content: msg.content,
		imageUrl: msg.imageUrl,
		fileUrl: msg.fileUrl,
		timestamp: msg.timestamp,
		read: chat && currentMember ? hasOtherSideReadMessage(msg, chat, currentMember) : msg.read,
	};
}

function normalizeChatScope(doc: ChatDocument): ChatScope {
	if (doc.chatScope === ChatScope.HOTEL || doc.chatScope === ChatScope.SUPPORT) {
		return doc.chatScope;
	}

	return doc.hotelId ? ChatScope.HOTEL : ChatScope.SUPPORT;
}

export function toChatDto(
	doc: ChatDocument,
	currentMember?: MemberJwtPayload,
	options?: {
		includeMessages?: boolean;
		guestNick?: string;
		guestImage?: string;
		guestMemberType?: MemberType;
	},
): ChatDto {
	const includeMessages = options?.includeMessages !== false;
	const guestId = stringifyObjectId(doc.guestId);
	const currentMemberId = currentMember?._id ?? '';
	const lastMessage = doc.messages.at(-1);
	const unreadGuestMessages = countUnreadMessagesForMember(doc.messages, guestId, SenderType.AGENT);
	const unreadAgentMessages =
		currentMemberId && currentMemberId !== guestId
			? countUnreadMessagesForMember(doc.messages, currentMemberId, SenderType.GUEST)
			: doc.unreadAgentMessages;

	return {
		_id: doc._id as unknown as ChatDto['_id'],
		guestId: doc.guestId as unknown as ChatDto['guestId'],
		guestNick: options?.guestNick?.trim() || undefined,
		guestImage: options?.guestImage?.trim() || undefined,
		guestMemberType: options?.guestMemberType,
		hotelId: doc.hotelId as unknown as ChatDto['hotelId'],
		chatScope: normalizeChatScope(doc),
		assignedAgentId: doc.assignedAgentId as unknown as ChatDto['assignedAgentId'],
		bookingId: doc.bookingId as unknown as ChatDto['bookingId'],
		supportTopic: doc.supportTopic,
		sourcePath: doc.sourcePath,
		...(includeMessages
			? { messages: doc.messages.map((message) => toMessageDto(message, doc, currentMember)) }
			: {}),
		lastMessage: lastMessage ? toMessageDto(lastMessage, doc, currentMember) : undefined,
		chatStatus: doc.chatStatus,
		unreadGuestMessages,
		unreadAgentMessages,
		lastMessageAt: doc.lastMessageAt,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
