import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StartChatInput } from '../../libs/dto/chat/chat.input';
import { StartSupportChatInput } from '../../libs/dto/chat/support-chat.input';
import { SendMessageInput } from '../../libs/dto/chat/message.input';
import { ClaimChatInput } from '../../libs/dto/chat/claim-chat.input';
import { ChatDto } from '../../libs/dto/chat/chat';
import { ChatsDto } from '../../libs/dto/common/chats';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ChatScope, ChatStatus, SenderType, MessageType, NotificationType } from '../../libs/enums/common.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enum';
import { Messages } from '../../libs/messages';
import type { MemberDocument, MemberJwtPayload } from '../../libs/types/member';
import type { ChatDocument } from '../../libs/types/chat';
import { countUnreadMessagesForMember, toChatDto } from '../../libs/types/chat';
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

		const senderType = SenderType.GUEST;
		const unreadSeed = this.buildUnreadSeed(senderType);

		// Check if guest already has an active/waiting chat with this hotel
		const existingChat = await this.chatModel
			.findOne({
				guestId: currentMember._id,
				hotelId: input.hotelId,
				chatScope: ChatScope.HOTEL,
				chatStatus: { $in: [ChatStatus.WAITING, ChatStatus.ACTIVE] },
			})
			.exec();

		if (existingChat) {
			throw new BadRequestException(Messages.CHAT_ALREADY_EXISTS);
		}

		const initialMessage = this.buildInitialMessage(currentMember._id, senderType, input.initialMessage);

		const chat = await this.chatModel.create({
			guestId: currentMember._id,
			hotelId: input.hotelId,
			chatScope: ChatScope.HOTEL,
			bookingId: input.bookingId || undefined,
			chatStatus: ChatStatus.WAITING,
			messages: [initialMessage],
			...unreadSeed,
			lastMessageAt: new Date(),
		});

		// Emit WebSocket event for new chat
		this.chatGateway.emitNewMessage(chat._id.toString(), {
			senderId: currentMember._id,
			senderType,
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
				`/chats/${chat._id.toString()}`,
			)
			.catch(() => {});

		void this.notifyChatParticipants(chat, 'chatListUpdated', { chatId: String(chat._id) });

		return this.toChatDtoWithGuest(chat, currentMember);
	}

	/**
	 * User starts a general support chat with the platform (not hotel-scoped)
	 */
	public async startSupportChat(currentMember: MemberJwtPayload, input: StartSupportChatInput): Promise<ChatDto> {
		const senderType = SenderType.GUEST;
		const unreadSeed = this.buildUnreadSeed(senderType);
		const initialMessage = this.buildInitialMessage(currentMember._id, senderType, input.initialMessage);
		const existingSupportChats = await this.chatModel
			.find({
				guestId: currentMember._id,
				chatScope: ChatScope.SUPPORT,
				chatStatus: { $in: [ChatStatus.WAITING, ChatStatus.ACTIVE] },
			})
			.sort({ lastMessageAt: -1, updatedAt: -1 })
			.exec();

		const primaryExistingChat = existingSupportChats[0] ?? null;

		if (primaryExistingChat) {
			if (existingSupportChats.length > 1) {
				const duplicateIds = existingSupportChats.slice(1).map((chat) => chat._id);
				if (duplicateIds.length > 0) {
					await this.chatModel.updateMany(
						{ _id: { $in: duplicateIds } },
						{ $set: { chatStatus: ChatStatus.CLOSED } },
					);
				}
			}

			const shouldAssignSupport = !primaryExistingChat.assignedAgentId;
			const assignedSupportId = shouldAssignSupport ? await this.selectSupportAssigneeId() : null;
			const updatedExistingChat = await this.chatModel
				.findByIdAndUpdate(
					primaryExistingChat._id,
					{
						$push: { messages: initialMessage },
						$set: {
							lastMessageAt: new Date(),
							supportTopic: primaryExistingChat.supportTopic || input.topic || undefined,
							sourcePath: primaryExistingChat.sourcePath || input.sourcePath || undefined,
							...(assignedSupportId
								? {
										assignedAgentId: assignedSupportId,
										chatStatus: ChatStatus.ACTIVE,
									}
								: {}),
						},
						$inc: { unreadAgentMessages: 1 },
					},
					{ returnDocument: 'after' },
				)
				.exec();

			this.chatGateway.emitNewMessage(updatedExistingChat!._id.toString(), {
				senderId: currentMember._id,
				senderType,
				messageType: MessageType.TEXT,
				content: input.initialMessage,
				timestamp: initialMessage.timestamp,
				read: false,
			});

			if (assignedSupportId) {
				this.chatGateway.emitChatClaimed(updatedExistingChat!._id.toString(), assignedSupportId.toString());
			}

			void this.notifyChatParticipants(updatedExistingChat!, 'chatListUpdated', {
				chatId: String(updatedExistingChat!._id),
			});

			return this.toChatDtoWithGuest(updatedExistingChat!, currentMember);
		}

		const assignedSupportId = await this.selectSupportAssigneeId();

		const chat = await this.chatModel.create({
			guestId: currentMember._id,
			chatScope: ChatScope.SUPPORT,
			assignedAgentId: assignedSupportId ?? undefined,
			bookingId: input.bookingId || undefined,
			supportTopic: input.topic || undefined,
			sourcePath: input.sourcePath || undefined,
			chatStatus: assignedSupportId ? ChatStatus.ACTIVE : ChatStatus.WAITING,
			messages: [initialMessage],
			...unreadSeed,
			lastMessageAt: new Date(),
		});

		this.chatGateway.emitNewMessage(chat._id.toString(), {
			senderId: currentMember._id,
			senderType,
			messageType: MessageType.TEXT,
			content: input.initialMessage,
			timestamp: initialMessage.timestamp,
			read: false,
		});

		if (assignedSupportId) {
			this.chatGateway.emitChatClaimed(chat._id.toString(), assignedSupportId.toString());
		}

		this.notificationService
			.notifyAdmins(
				NotificationType.CHAT_MESSAGE,
				'New General Support Chat',
				`User opened platform support chat${input.topic ? ` (${input.topic})` : ''}`,
				`/chats/${chat._id.toString()}`,
			)
			.catch(() => {});

		void this.notifyChatParticipants(chat, 'chatListUpdated', { chatId: String(chat._id) });

		return this.toChatDtoWithGuest(chat, currentMember);
	}

	/**
	 * Send a message in an existing chat (guest or agent)
	 */
	public async sendMessage(currentMember: MemberJwtPayload, input: SendMessageInput): Promise<ChatDto> {
		const chat = await this.chatModel.findById(input.chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const senderType = await this.assertChatReadAccess(currentMember, chat);
		if (senderType === SenderType.AGENT) {
			this.assertOperatorWriteAccess(currentMember, chat);
		}

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
			readByMemberIds: [new Types.ObjectId(currentMember._id)],
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

		void this.notifyChatParticipants(updatedChat!, 'chatListUpdated', { chatId: input.chatId });

		return this.toChatDtoWithGuest(updatedChat!, currentMember);
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

		if (chat.chatScope === ChatScope.SUPPORT) {
			if (currentMember.memberType === MemberType.AGENT) {
				throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
			}
		} else {
			await this.assertHotelChatAccess(currentMember, String(chat.hotelId));
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

		// Emit WebSocket event for chat claimed
		this.chatGateway.emitChatClaimed(input.chatId, currentMember._id);
		void this.notifyChatParticipants(updatedChat!, 'chatListUpdated', { chatId: input.chatId });

		return this.toChatDtoWithGuest(updatedChat!, currentMember);
	}

	/**
	 * Close a chat (guest or assigned agent)
	 */
	public async closeChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const senderType = await this.assertChatReadAccess(currentMember, chat);
		if (senderType === SenderType.AGENT) {
			this.assertOperatorWriteAccess(currentMember, chat);
		}

		if (chat.chatStatus === ChatStatus.CLOSED) {
			throw new BadRequestException(Messages.CHAT_CLOSED);
		}

		const updatedChat = await this.chatModel
			.findByIdAndUpdate(chatId, { $set: { chatStatus: ChatStatus.CLOSED } }, { returnDocument: 'after' })
			.exec();

		// Emit WebSocket event for chat closed
		this.chatGateway.emitChatClosed(chatId, currentMember._id);
		void this.notifyChatParticipants(updatedChat!, 'chatListUpdated', { chatId });

		return this.toChatDtoWithGuest(updatedChat!, currentMember);
	}

	/**
	 * Get a single chat by ID (only participants can access)
	 */
	public async getChat(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).lean().exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		await this.assertChatReadAccess(currentMember, chat);

		return this.toChatDtoWithGuest(chat, currentMember);
	}

	/**
	 * Get guest's chats (paginated)
	 */
	public async getMyChats(currentMember: MemberJwtPayload, input: PaginationInput): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter = { guestId: currentMember._id };

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean().exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: await this.toChatDtosWithGuest(list, currentMember, { includeMessages: false }),
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
		filter.chatScope = ChatScope.HOTEL;
		if (statusFilter) {
			filter.chatStatus = statusFilter;
		}

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean().exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: await this.toChatDtosWithGuest(list, currentMember, { includeMessages: false }),
			metaCounter: { total },
		};
	}

	public async getOperatorChats(
		currentMember: MemberJwtPayload,
		input: PaginationInput,
		scopeFilter?: ChatScope,
		statusFilter?: ChatStatus,
		hotelId?: string,
	): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;
		const filter = await this.buildOperatorChatFilter(currentMember, scopeFilter, statusFilter, hotelId);

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean().exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: await this.toChatDtosWithGuest(list, currentMember, { includeMessages: false }),
			metaCounter: { total },
		};
	}

	/**
	 * Mark messages as read (for the current user's unread messages)
	 */
	public async markMessagesAsRead(currentMember: MemberJwtPayload, chatId: string): Promise<ChatDto> {
		const chat = await this.chatModel.findById(chatId).exec();
		if (!chat) throw new NotFoundException(Messages.NO_DATA_FOUND);

		const senderType = await this.assertChatReadAccess(currentMember, chat);

		const otherSenderType = senderType === SenderType.GUEST ? SenderType.AGENT : SenderType.GUEST;
		const currentMemberId = new Types.ObjectId(currentMember._id);

		const counterReset = senderType === SenderType.GUEST ? { unreadGuestMessages: 0 } : { unreadAgentMessages: 0 };

		await this.chatModel
			.findByIdAndUpdate(
				chatId,
				{
					$set: {
						...counterReset,
						'messages.$[msg].read': true,
					},
					$addToSet: {
						'messages.$[msg].readByMemberIds': currentMemberId,
					},
				},
				{
					arrayFilters: [
						{
							'msg.senderType': otherSenderType,
							'msg.readByMemberIds': { $ne: currentMemberId },
						},
					],
				},
			)
			.exec();

		// Emit WebSocket event for messages read
		this.chatGateway.emitMessagesRead(chatId, currentMember._id);

		const updatedChat = await this.chatModel.findById(chatId).exec();
		void this.notifyChatParticipants(updatedChat!, 'chatListUpdated', { chatId });
		return this.toChatDtoWithGuest(updatedChat!, currentMember);
	}

	/**
	 * Get total unread message count across all chats (as guest AND as agent)
	 */
	public async getMyUnreadCount(currentMember: MemberJwtPayload): Promise<number> {
		if (currentMember.memberType === MemberType.USER) {
			const chats = await this.chatModel
				.find({ guestId: currentMember._id })
				.select('messages senderType guestId')
				.lean()
				.exec();

			return chats.reduce(
				(total, chat) => total + countUnreadMessagesForMember(chat.messages ?? [], currentMember._id, SenderType.AGENT),
				0,
			);
		}

		if (!this.isChatOperatorRole(currentMember.memberType)) {
			return 0;
		}

		const filter = await this.buildOperatorChatFilter(currentMember);
		const chats = await this.chatModel.find(filter).select('messages senderType guestId').lean().exec();
		return chats.reduce(
			(total, chat) => total + countUnreadMessagesForMember(chat.messages ?? [], currentMember._id, SenderType.GUEST),
			0,
		);
	}

	/**
	 * Get all chats (admin only)
	 */
	public async getAllChatsAdmin(
		currentMember: MemberJwtPayload,
		input: PaginationInput,
		statusFilter?: ChatStatus,
	): Promise<ChatsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter: Record<string, unknown> = {};
		if (statusFilter) {
			filter.chatStatus = statusFilter;
		}

		const [list, total] = await Promise.all([
			this.chatModel.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean().exec(),
			this.chatModel.countDocuments(filter).exec(),
		]);

		return {
			list: await this.toChatDtosWithGuest(list, currentMember, { includeMessages: false }),
			metaCounter: { total },
		};
	}

	/**
	 * Admin reassigns a chat to a different agent
	 */
	public async reassignChat(currentMember: MemberJwtPayload, chatId: string, newAgentId: string): Promise<ChatDto> {
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
			if (chat.chatScope !== ChatScope.HOTEL || !chat.hotelId) {
				throw new BadRequestException('AGENT assignee is only allowed for hotel chats');
			}
			const hotel = await this.hotelModel.findById(chat.hotelId).select('memberId').exec();
			if (!hotel) {
				throw new NotFoundException(Messages.NO_DATA_FOUND);
			}
			if (String(hotel.memberId) !== String(assignee._id)) {
				throw new BadRequestException('AGENT assignee must own the hotel for this chat');
			}
		}

		if (chat.assignedAgentId?.toString() === String(assignee._id)) {
			return this.toChatDtoWithGuest(chat, currentMember);
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
		void this.notifyChatParticipants(updatedChat!, 'chatListUpdated', { chatId });

		return this.toChatDtoWithGuest(updatedChat!, currentMember);
	}

	private async buildGuestProfileMap(
		chats: Array<Pick<ChatDocument, 'guestId'>>,
	): Promise<Map<string, { guestNick?: string; guestImage?: string; guestMemberType?: MemberType }>> {
		const guestIds = Array.from(
			new Set(
				chats
					.map((chat) => String(chat.guestId ?? ''))
					.filter((guestId) => Types.ObjectId.isValid(guestId)),
			),
		);

		if (guestIds.length === 0) {
			return new Map();
		}

		const members = await this.memberModel
			.find({ _id: { $in: guestIds } })
			.select('_id memberNick memberImage memberType')
			.lean<{ _id: Types.ObjectId | string; memberNick?: string; memberImage?: string; memberType?: MemberType }[]>()
			.exec();

		return new Map(
			members.map((member) => [
				String(member._id),
				{
					guestNick: member.memberNick?.trim() || undefined,
					guestImage: member.memberImage?.trim() || undefined,
					guestMemberType: member.memberType,
				},
			]),
		);
	}

	private async toChatDtoWithGuest(
		chat: ChatDocument,
		currentMember?: MemberJwtPayload,
		options?: { includeMessages?: boolean },
	): Promise<ChatDto> {
		const guestProfiles = await this.buildGuestProfileMap([chat]);
		const guestProfile = guestProfiles.get(String(chat.guestId));
		return toChatDto(chat, currentMember, {
			...options,
			guestNick: guestProfile?.guestNick,
			guestImage: guestProfile?.guestImage,
			guestMemberType: guestProfile?.guestMemberType,
		});
	}

	private async toChatDtosWithGuest(
		chats: ChatDocument[],
		currentMember?: MemberJwtPayload,
		options?: { includeMessages?: boolean },
	): Promise<ChatDto[]> {
		const guestProfiles = await this.buildGuestProfileMap(chats);
		return chats.map((chat) => {
			const guestProfile = guestProfiles.get(String(chat.guestId));
			return toChatDto(chat, currentMember, {
				...options,
				guestNick: guestProfile?.guestNick,
				guestImage: guestProfile?.guestImage,
				guestMemberType: guestProfile?.guestMemberType,
			});
		});
	}

	private async notifyChatParticipants(
		chat: ChatDocument,
		event: string,
		payload: Record<string, unknown>,
	): Promise<void> {
		const userIds = new Set<string>();

		if (chat.guestId) {
			userIds.add(String(chat.guestId));
		}
		if (chat.assignedAgentId) {
			userIds.add(String(chat.assignedAgentId));
		}

		if (chat.chatScope === ChatScope.HOTEL && chat.hotelId) {
			const hotel = await this.hotelModel.findById(chat.hotelId).select('memberId').lean().exec();
			if (hotel?.memberId) {
				userIds.add(String(hotel.memberId));
			}
		}

		const backofficeMembers = await this.memberModel
			.find({
				memberType: { $in: [MemberType.ADMIN, MemberType.ADMIN_OPERATOR] },
				memberStatus: MemberStatus.ACTIVE,
			})
			.select('_id')
			.lean()
			.exec();

		for (const member of backofficeMembers) {
			userIds.add(String(member._id));
		}

		for (const userId of userIds) {
			this.chatGateway.sendToUser(userId, event, payload);
		}
	}

	/**
	 * Determine if user is guest or agent, and validate access
	 */
	private async assertChatReadAccess(currentMember: MemberJwtPayload, chat: ChatDocument): Promise<SenderType> {
		if (chat.guestId.toString() === currentMember._id) {
			return SenderType.GUEST;
		}

		if (!this.isChatOperatorRole(currentMember.memberType)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		if (chat.chatScope === ChatScope.SUPPORT) {
			if (currentMember.memberType === MemberType.AGENT) {
				throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
			}
			return SenderType.AGENT;
		}

		if (!chat.hotelId) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		await this.assertHotelChatAccess(currentMember, String(chat.hotelId));
		return SenderType.AGENT;
	}

	private assertOperatorWriteAccess(currentMember: MemberJwtPayload, chat: ChatDocument): void {
		if (chat.assignedAgentId?.toString() !== currentMember._id) {
			throw new ForbiddenException('Claim this chat before replying or closing it');
		}
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

	private buildInitialMessage(
		senderId: string,
		senderType: SenderType,
		content: string,
	): ChatDocument['messages'][number] {
		return {
			senderId: new Types.ObjectId(senderId),
			senderType,
			messageType: MessageType.TEXT,
			content,
			timestamp: new Date(),
			readByMemberIds: [new Types.ObjectId(senderId)],
			read: false,
		};
	}

	private buildUnreadSeed(senderType: SenderType): Pick<ChatDocument, 'unreadGuestMessages' | 'unreadAgentMessages'> {
		return senderType === SenderType.GUEST
			? { unreadGuestMessages: 0, unreadAgentMessages: 1 }
			: { unreadGuestMessages: 1, unreadAgentMessages: 0 };
	}

	private async buildOperatorChatFilter(
		currentMember: MemberJwtPayload,
		scopeFilter?: ChatScope,
		statusFilter?: ChatStatus,
		hotelId?: string,
	): Promise<Record<string, unknown>> {
		if (!this.isChatOperatorRole(currentMember.memberType)) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		if (scopeFilter === ChatScope.SUPPORT && currentMember.memberType === MemberType.AGENT) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const filter: Record<string, unknown> = {};

		if (statusFilter) {
			filter.chatStatus = statusFilter;
		}

		if (currentMember.memberType === MemberType.AGENT) {
			const ownedHotels = await this.hotelModel
				.find({ memberId: currentMember._id })
				.select('_id')
				.lean()
				.exec();
			const ownedHotelIds = ownedHotels.map((hotel) => hotel._id);

			filter.chatScope = ChatScope.HOTEL;
			if (hotelId) {
				if (!ownedHotelIds.some((ownedHotelId) => String(ownedHotelId) === hotelId)) {
					throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
				}
				filter.hotelId = hotelId;
				return filter;
			}

			filter.hotelId =
				ownedHotelIds.length > 0 ? { $in: ownedHotelIds } : { $in: [new Types.ObjectId('000000000000000000000000')] };
			return filter;
		}

		if (scopeFilter) {
			filter.chatScope = scopeFilter;
		}

		if (hotelId) {
			filter.hotelId = hotelId;
		}

		return filter;
	}

	private async selectSupportAssigneeId(): Promise<Types.ObjectId | null> {
		const supportMembers = await this.memberModel
			.find({
				memberType: { $in: [MemberType.ADMIN_OPERATOR, MemberType.ADMIN] },
				memberStatus: MemberStatus.ACTIVE,
			})
			.select('_id')
			.lean()
			.exec();

		if (supportMembers.length === 0) {
			return null;
		}

		const supportIds = supportMembers.map((member) => new Types.ObjectId(String(member._id)));
		const loadRows = await this.chatModel
			.aggregate<{ _id: Types.ObjectId; load: number }>([
				{
					$match: {
						assignedAgentId: { $in: supportIds },
						chatStatus: { $in: [ChatStatus.WAITING, ChatStatus.ACTIVE] },
					},
				},
				{
					$group: {
						_id: '$assignedAgentId',
						load: { $sum: 1 },
					},
				},
			])
			.exec();

		const loadsById = new Map<string, number>();
		for (const row of loadRows) {
			loadsById.set(String(row._id), row.load);
		}

		let selectedId: Types.ObjectId | null = null;
		let minLoad = Number.POSITIVE_INFINITY;

		for (const supportId of supportIds) {
			const currentLoad = loadsById.get(String(supportId)) ?? 0;
			if (currentLoad < minLoad) {
				minLoad = currentLoad;
				selectedId = supportId;
			}
		}

		return selectedId;
	}
}
