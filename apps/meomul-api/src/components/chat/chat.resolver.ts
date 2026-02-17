import { Args, Mutation, Query, Resolver, Int } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { ChatDto } from '../../libs/dto/chat/chat';
import { StartChatInput } from '../../libs/dto/chat/chat.input';
import { SendMessageInput } from '../../libs/dto/chat/message.input';
import { ClaimChatInput } from '../../libs/dto/chat/claim-chat.input';
import { ChatsDto } from '../../libs/dto/common/chats';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { ChatStatus } from '../../libs/enums/common.enum';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { ChatService } from './chat.service';

@Resolver()
export class ChatResolver {
	private readonly logger = new Logger(ChatResolver.name);

	constructor(private readonly chatService: ChatService) {}

	/**
	 * Guest starts a new chat with a hotel
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async startChat(
		@CurrentMember() currentMember: any,
		@Args('input') input: StartChatInput,
	): Promise<ChatDto> {
		this.logger.log('Mutation startChat', currentMember?._id, input.hotelId);
		return this.chatService.startChat(currentMember, input);
	}

	/**
	 * Send a message in an existing chat
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async sendMessage(
		@CurrentMember() currentMember: any,
		@Args('input') input: SendMessageInput,
	): Promise<ChatDto> {
		this.logger.log('Mutation sendMessage', currentMember?._id, input.chatId, input.messageType);
		return this.chatService.sendMessage(currentMember, input);
	}

	/**
	 * Agent claims an unassigned chat
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async claimChat(
		@CurrentMember() currentMember: any,
		@Args('input') input: ClaimChatInput,
	): Promise<ChatDto> {
		this.logger.log('Mutation claimChat', currentMember?._id, input.chatId);
		return this.chatService.claimChat(currentMember, input);
	}

	/**
	 * Close a chat
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async closeChat(
		@CurrentMember() currentMember: any,
		@Args('chatId') chatId: string,
	): Promise<ChatDto> {
		this.logger.log('Mutation closeChat', currentMember?._id, chatId);
		return this.chatService.closeChat(currentMember, chatId);
	}

	/**
	 * Mark messages as read
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async markChatMessagesAsRead(
		@CurrentMember() currentMember: any,
		@Args('chatId') chatId: string,
	): Promise<ChatDto> {
		this.logger.log('Mutation markChatMessagesAsRead', currentMember?._id, chatId);
		return this.chatService.markMessagesAsRead(currentMember, chatId);
	}

	/**
	 * Get a single chat by ID
	 */
	@Query(() => ChatDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getChat(
		@CurrentMember() currentMember: any,
		@Args('chatId') chatId: string,
	): Promise<ChatDto> {
		this.logger.log('Query getChat', currentMember?._id, chatId);
		return this.chatService.getChat(currentMember, chatId);
	}

	/**
	 * Get current user's chats (as guest)
	 */
	@Query(() => ChatsDto)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyChats(
		@CurrentMember() currentMember: any,
		@Args('input') input: PaginationInput,
	): Promise<ChatsDto> {
		this.logger.log('Query getMyChats', currentMember?._id);
		return this.chatService.getMyChats(currentMember, input);
	}

	/**
	 * Get hotel's chats (for agent/admin)
	 */
	@Query(() => ChatsDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async getHotelChats(
		@CurrentMember() currentMember: any,
		@Args('hotelId') hotelId: string,
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => ChatStatus, nullable: true }) statusFilter?: ChatStatus,
	): Promise<ChatsDto> {
		this.logger.log('Query getHotelChats', currentMember?._id, hotelId, statusFilter);
		return this.chatService.getHotelChats(currentMember, hotelId, input, statusFilter);
	}

	/**
	 * Get total unread message count for current user
	 */
	@Query(() => Int)
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getMyUnreadChatCount(@CurrentMember() currentMember: any): Promise<number> {
		this.logger.log('Query getMyUnreadChatCount', currentMember?._id);
		return this.chatService.getMyUnreadCount(currentMember);
	}

	/**
	 * Get all chats (admin only)
	 */
	@Query(() => ChatsDto)
	@Roles(MemberType.ADMIN)
	public async getAllChatsAdmin(
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => ChatStatus, nullable: true }) statusFilter?: ChatStatus,
	): Promise<ChatsDto> {
		this.logger.log('Query getAllChatsAdmin', statusFilter);
		return this.chatService.getAllChatsAdmin(input, statusFilter);
	}

	/**
	 * Admin reassigns a chat to a different agent
	 */
	@Mutation(() => ChatDto)
	@Roles(MemberType.ADMIN)
	public async reassignChat(
		@Args('chatId') chatId: string,
		@Args('newAgentId') newAgentId: string,
	): Promise<ChatDto> {
		this.logger.log('Mutation reassignChat', chatId, newAgentId);
		return this.chatService.reassignChat(chatId, newAgentId);
	}
}
