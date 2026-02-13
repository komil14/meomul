import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StartChatInput } from '../../libs/dto/chat/chat.input';
import { SendMessageInput } from '../../libs/dto/chat/message.input';
import { ClaimChatInput } from '../../libs/dto/chat/claim-chat.input';
import { ChatDto } from '../../libs/dto/chat/chat';
import { ChatsDto } from '../../libs/dto/common/chats';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ChatStatus, SenderType, MessageType } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { ChatDocument } from '../../libs/types/chat';
import { toChatDto } from '../../libs/types/chat';

@Injectable()
export class ChatService {
	constructor(@InjectModel('Chat') private readonly chatModel: Model<ChatDocument>) {}

	/**
	 * Guest starts a new chat with a hotel
	 */
	public async startChat(currentMember: MemberJwtPayload, input: StartChatInput): Promise<ChatDto> {
		// Check if guest already has an active/waiting chat with this hotel
		const existingChat = await this.chatModel
			.findOne({
				guestId: currentMember._id,
				hotelId: input.hotelId,
				chatStatus: { $in: [ChatStatus.WAITING, ChatStatus.ACTIVE] },
			})
			.exec();

		if (existingChat) {
			throw new BadRequestException(Messages.CHAT_ALREADY_EXISTS);
		}

		const chat = await this.chatModel.create({
			guestId: currentMember._id,
			hotelId: input.hotelId,
			bookingId: input.bookingId || undefined,
			chatStatus: ChatStatus.WAITING,
			messages: [
				{
					senderId: new Types.ObjectId(currentMember._id),
					senderType: SenderType.GUEST,
					messageType: MessageType.TEXT,
					content: input.initialMessage,
					timestamp: new Date(),
					read: false,
				},
			],
			unreadGuestMessages: 0,
			unreadAgentMessages: 1,
			lastMessageAt: new Date(),
		});

		return toChatDto(chat);
	}

	/**
	 * Send a message in an existing chat (guest or agent)
	 */
	public async sendMessage(currentMember: MemberJwtPayload, input: SendMessageInput): Promise<ChatDto> {
		const chat = await this.chatModel.findById(input.chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Determine sender type and validate access
		const senderType = this.getSenderType(currentMember, chat);

		// Validate chat is not closed
		if (chat.chatStatus === ChatStatus.CLOSED) {
			throw new BadRequestException(Messages.CHAT_CLOSED);
		}

		// Build message
		const message = {
			senderId: new Types.ObjectId(currentMember._id),
			senderType,
			messageType: input.messageType,
			content: input.content,
			imageUrl: input.imageUrl,
			fileUrl: input.fileUrl,
			timestamp: new Date(),
			read: false,
		};

		// Update unread counts based on sender
		const unreadUpdate =
			senderType === SenderType.GUEST ? { $inc: { unreadAgentMessages: 1 } } : { $inc: { unreadGuestMessages: 1 } };

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(
				input.chatId,
				{
					$push: { messages: message },
					$set: { lastMessageAt: new Date() },
					...unreadUpdate,
				},
				{ returnDocument: 'after' },
			)
			.exec();

		return toChatDto(updatedChat!);
	}

	/**
	 * Agent claims an unassigned chat
	 */
	public async claimChat(currentMember: MemberJwtPayload, input: ClaimChatInput): Promise<ChatDto> {
		const chat = await this.chatModel.findById(input.chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		if (chat.assignedAgentId) {
			throw new BadRequestException(Messages.CHAT_ALREADY_CLAIMED);
		}

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(
				input.chatId,
				{
					$set: {
						assignedAgentId: new Types.ObjectId(currentMember._id),
						chatStatus: ChatStatus.ACTIVE,
					},
				},
				{ returnDocument: 'after' },
			)
			.exec();

		return toChatDto(updatedChat!);
	}

	/**
	 * Close a chat (guest or assigned agent)
	 */
	public async closeChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Only guest or assigned agent can close
		const isGuest = chat.guestId.toString() === currentMember._id;
		const isAssignedAgent = chat.assignedAgentId?.toString() === currentMember._id;

		if (!isGuest && !isAssignedAgent) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		if (chat.chatStatus === ChatStatus.CLOSED) {
			throw new BadRequestException(Messages.CHAT_CLOSED);
		}

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(chatId, { $set: { chatStatus: ChatStatus.CLOSED } }, { returnDocument: 'after' })
			.exec();

		return toChatDto(updatedChat!);
	}

	/**
	 * Get a single chat by ID (only participants can access)
	 */
	public async getChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Validate access
		this.getSenderType(currentMember, chat);

		return toChatDto(chat);
	}

	/**
	 * Get guest's chats (paginated)
	 */
	public async getMyChats(currentMember: MemberJwtPayload, input: PaginationInput): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter = { guestId: currentMember._id };

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: list.map(toChatDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get hotel's chats for agent (paginated)
	 */
	public async getHotelChats(
		_currentMember: MemberJwtPayload,
		hotelId: string,
		input: PaginationInput,
		statusFilter?: ChatStatus,
	): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter: any = { hotelId };
		if (statusFilter) {
			filter.chatStatus = statusFilter;
		}

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: list.map(toChatDto),
			metaCounter: { total },
		};
	}

	/**
	 * Mark messages as read (for the current user's unread messages)
	 */
	public async markMessagesAsRead(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const senderType = this.getSenderType(currentMember, chat);

		// Mark all unread messages from the OTHER side as read
		const otherSenderType = senderType === SenderType.GUEST ? SenderType.AGENT : SenderType.GUEST;

		// Step 1: Reset unread counter
		const counterReset =
			senderType === SenderType.GUEST ? { unreadGuestMessages: 0 } : { unreadAgentMessages: 0 };

		await this.chatModel.findByIdAndUpdate(chatId, { $set: counterReset }).exec();

		// Step 2: Mark individual messages as read
		await this.chatModel.findByIdAndUpdate(
			chatId,
			{ $set: { 'messages.$[msg].read': true } },
			{ arrayFilters: [{ 'msg.senderType': otherSenderType, 'msg.read': false }] },
		).exec();

		const updatedChat = await this.chatModel.findById(chatId).exec();
		return toChatDto(updatedChat!);
	}

	/**
	 * Get total unread message count across all chats (as guest AND as agent)
	 */
	public async getMyUnreadCount(currentMember: MemberJwtPayload): Promise<number> {
		const memberId = new Types.ObjectId(currentMember._id);

		const result = await this.chatModel
			.aggregate([
				{
					$match: {
						$or: [{ guestId: memberId }, { assignedAgentId: memberId }],
					},
				},
				{
					$group: {
						_id: null,
						total: {
							$sum: {
								$cond: [{ $eq: ['$guestId', memberId] }, '$unreadGuestMessages', '$unreadAgentMessages'],
							},
						},
					},
				},
			])
			.exec();

		return result.length > 0 ? result[0].total : 0;
	}

	/**
	 * Determine if user is guest or agent, and validate access
	 */
	private getSenderType(currentMember: MemberJwtPayload, chat: ChatDocument): SenderType {
		if (chat.guestId.toString() === currentMember._id) {
			return SenderType.GUEST;
		}

		if (chat.assignedAgentId?.toString() === currentMember._id) {
			return SenderType.AGENT;
		}

		// Allow hotel owner/agent to access even if not assigned yet
		// This is checked at resolver level via hotel ownership
		throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
	}
}
