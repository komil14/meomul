import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StartChatInput } from '../../libs/dto/chat/chat.input';
import { SendMessageInput } from '../../libs/dto/chat/message.input';
import { ClaimChatInput } from '../../libs/dto/chat/claim-chat.input';
import { ChatDto } from '../../libs/dto/chat/chat';
import { ChatsDto } from '../../libs/dto/common/chats';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ChatStatus, SenderType, MessageType, NotificationType } from '../../libs/enums/common.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { ChatDocument } from '../../libs/types/chat';
import { toChatDto } from '../../libs/types/chat';
import type { HotelDocument } from '../../libs/types/hotel';
import { ChatGateway } from '../../socket/chat.gateway';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ChatService {
	constructor(
		@InjectModel('Chat') private readonly chatModel: Model<ChatDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
		private readonly chatGateway: ChatGateway,
		private readonly notificationService: NotificationService,
	) {}

	/**
	 * Guest starts a new chat with a hotel
	 */
	public async startChat(currentMember: MemberJwtPayload, input: StartChatInput): Promise<ChatDto> {
		const hotel = await this.hotelModel.findById(input.hotelId).select('hotelStatus').exec();
		if (!hotel || hotel.hotelStatus !== HotelStatus.ACTIVE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

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

		const initialMessage = {
			senderId: new Types.ObjectId(currentMember._id),
			senderType: SenderType.GUEST,
			messageType: MessageType.TEXT,
			content: input.initialMessage,
			timestamp: new Date(),
			read: false,
		};

		const chat = await this.chatModel.create({
			guestId: currentMember._id,
			hotelId: input.hotelId,
			bookingId: input.bookingId || undefined,
			chatStatus: ChatStatus.WAITING,
			messages: [initialMessage],
			unreadGuestMessages: 0,
			unreadAgentMessages: 1,
			lastMessageAt: new Date(),
		});

		// Emit WebSocket event for new chat
		this.chatGateway.emitNewMessage(chat._id.toString(), {
			senderId: currentMember._id,
			senderType: SenderType.GUEST,
			messageType: MessageType.TEXT,
			content: input.initialMessage,
			timestamp: initialMessage.timestamp,
			read: false,
		});

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.CHAT_MESSAGE,
				'New Support Chat',
				`Guest started a chat for hotel ${input.hotelId}`,
				`/admin/chats/${chat._id.toString()}`,
			)
			.catch(() => {});

		return toChatDto(chat);
	}

	/**
	 * Send a message in an existing chat (guest or agent)
	 */
	public async sendMessage(currentMember: MemberJwtPayload, input: SendMessageInput): Promise<ChatDto> {
		const chat = await this.chatModel.findById(input.chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Determine sender type and validate access
		const senderType = await this.getSenderType(currentMember, chat);

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

		// Emit WebSocket event for new message
		this.chatGateway.emitNewMessage(input.chatId, {
			senderId: currentMember._id,
			senderType,
			messageType: input.messageType,
			content: input.content,
			imageUrl: input.imageUrl,
			fileUrl: input.fileUrl,
			timestamp: message.timestamp,
			read: false,
		});

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

		await this.assertHotelChatAccess(currentMember, String(chat.hotelId));

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

		// Emit WebSocket event for chat claimed
		this.chatGateway.emitChatClaimed(input.chatId, currentMember._id);

		return toChatDto(updatedChat!);
	}

	/**
	 * Close a chat (guest or assigned agent)
	 */
	public async closeChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Only guest, assigned agent, or admin can close
		const isGuest = chat.guestId.toString() === currentMember._id;
		const isAssignedAgent = chat.assignedAgentId?.toString() === currentMember._id;
		const isAdmin = currentMember.memberType === MemberType.ADMIN;

		if (!isGuest && !isAssignedAgent && !isAdmin) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		if (chat.chatStatus === ChatStatus.CLOSED) {
			throw new BadRequestException(Messages.CHAT_CLOSED);
		}

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(chatId, { $set: { chatStatus: ChatStatus.CLOSED } }, { returnDocument: 'after' })
			.exec();

		// Emit WebSocket event for chat closed
		this.chatGateway.emitChatClosed(chatId, currentMember._id);

		return toChatDto(updatedChat!);
	}

	/**
	 * Get a single chat by ID (only participants can access)
	 */
	public async getChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		// Validate access
		await this.getSenderType(currentMember, chat);

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
		currentMember: MemberJwtPayload,
		hotelId: string,
		input: PaginationInput,
		statusFilter?: ChatStatus,
	): Promise<ChatsDto> {
		await this.assertHotelChatAccess(currentMember, hotelId);

		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter: Record<string, unknown> = { hotelId };
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

		const senderType = await this.getSenderType(currentMember, chat);

		// Mark all unread messages from the OTHER side as read
		const otherSenderType = senderType === SenderType.GUEST ? SenderType.AGENT : SenderType.GUEST;

		// Step 1: Reset unread counter
		const counterReset = senderType === SenderType.GUEST ? { unreadGuestMessages: 0 } : { unreadAgentMessages: 0 };

		await this.chatModel.findByIdAndUpdate(chatId, { $set: counterReset }).exec();

		// Step 2: Mark individual messages as read
		await this.chatModel
			.findByIdAndUpdate(
				chatId,
				{ $set: { 'messages.$[msg].read': true } },
				{ arrayFilters: [{ 'msg.senderType': otherSenderType, 'msg.read': false }] },
			)
			.exec();

		// Emit WebSocket event for messages read
		this.chatGateway.emitMessagesRead(chatId, currentMember._id);

		const updatedChat = await this.chatModel.findById(chatId).exec();
		return toChatDto(updatedChat!);
	}

	/**
	 * Get total unread message count across all chats (as guest AND as agent)
	 */
	public async getMyUnreadCount(currentMember: MemberJwtPayload): Promise<number> {
		const memberId = new Types.ObjectId(currentMember._id);

		const result = await this.chatModel
			.aggregate<{ total: number }>([
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
	 * Get all chats (admin only)
	 */
	public async getAllChatsAdmin(input: PaginationInput, statusFilter?: ChatStatus): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter: Record<string, unknown> = {};
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
	 * Admin reassigns a chat to a different agent
	 */
	public async reassignChat(chatId: string, newAgentId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		if (chat.chatStatus === ChatStatus.CLOSED) {
			throw new BadRequestException(Messages.CHAT_CLOSED);
		}

		const assignee = await this.memberModel.findById(newAgentId).select('memberType memberStatus').exec();
		if (!assignee) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		if (assignee.memberStatus !== MemberStatus.ACTIVE) {
			throw new BadRequestException('Only active operators can be assigned to chats');
		}
		if (!this.isChatOperatorRole(assignee.memberType)) {
			throw new BadRequestException('Chat assignee must be AGENT, ADMIN, or ADMIN_OPERATOR');
		}

		if (assignee.memberType === MemberType.AGENT) {
			const hotel = await this.hotelModel.findById(chat.hotelId).select('memberId').exec();
			if (!hotel) {
				throw new NotFoundException(Messages.NO_DATA_FOUND);
			}
			if (String(hotel.memberId) !== String(assignee._id)) {
				throw new BadRequestException('AGENT assignee must own the hotel for this chat');
			}
		}

		if (chat.assignedAgentId?.toString() === String(assignee._id)) {
			return toChatDto(chat);
		}

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(
				chatId,
				{
					$set: {
						assignedAgentId: assignee._id,
						chatStatus: ChatStatus.ACTIVE,
					},
				},
				{ returnDocument: 'after' },
			)
			.exec();

		// Emit WebSocket event for chat reassignment
		this.chatGateway.emitChatClaimed(chatId, newAgentId);

		return toChatDto(updatedChat!);
	}

	/**
	 * Determine if user is guest or agent, and validate access
	 */
	private async getSenderType(currentMember: MemberJwtPayload, chat: ChatDocument): Promise<SenderType> {
		if (this.isChatOperatorRole(currentMember.memberType) && currentMember.memberType !== MemberType.AGENT) {
			return SenderType.AGENT;
		}

		if (chat.guestId.toString() === currentMember._id) {
			return SenderType.GUEST;
		}

		if (chat.assignedAgentId?.toString() === currentMember._id) {
			return SenderType.AGENT;
		}

		// Allow hotel-owning agent to access any chat for their hotel
		if (currentMember.memberType === MemberType.AGENT) {
			const hotel = await this.hotelModel.findById(chat.hotelId).select('memberId').exec();
			if (hotel && String(hotel.memberId) === String(currentMember._id)) {
				return SenderType.AGENT;
			}
		}

		throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
	}

	private async assertHotelChatAccess(currentMember: MemberJwtPayload, hotelId: string): Promise<void> {
		if (!this.isChatOperatorRole(currentMember.memberType)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		if (currentMember.memberType !== MemberType.AGENT) {
			return;
		}

		const hotel = await this.hotelModel.findById(hotelId).select('memberId').exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
		if (String(hotel.memberId) !== String(currentMember._id)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
	}

	private isChatOperatorRole(memberType: MemberType): boolean {
		return (
			memberType === MemberType.AGENT || memberType === MemberType.ADMIN || memberType === MemberType.ADMIN_OPERATOR
		);
	}
}
