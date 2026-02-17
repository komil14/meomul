import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { RoomDto } from '../../libs/dto/room/room';
import { RoomInput } from '../../libs/dto/room/room.input';
import { RoomUpdate } from '../../libs/dto/room/room.update';
import { RoomsDto } from '../../libs/dto/common/rooms';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import { RoomService } from './room.service';

@Resolver()
export class RoomResolver {
	private readonly logger = new Logger(RoomResolver.name);

	constructor(private readonly roomService: RoomService) {}

	/**
	 * Create a new room (AGENT or ADMIN only)
	 */
	@Mutation(() => RoomDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async createRoom(
		@CurrentMember() currentMember: any,
		@Args('input') input: RoomInput,
	): Promise<RoomDto> {
		try {
			this.logger.log('Mutation createRoom', currentMember?._id ?? 'unknown', input.hotelId);
			return this.roomService.createRoom(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation createRoom failed', currentMember?._id ?? 'unknown', input.hotelId, error);
			throw error;
		}
	}

	/**
	 * Update room by owner
	 */
	@Mutation(() => RoomDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async updateRoom(
		@CurrentMember() currentMember: any,
		@Args('input') input: RoomUpdate,
	): Promise<RoomDto> {
		try {
			this.logger.log('Mutation updateRoom', currentMember?._id ?? 'unknown', input._id);
			return this.roomService.updateRoom(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation updateRoom failed', currentMember?._id ?? 'unknown', input._id, error);
			throw error;
		}
	}

	/**
	 * Get single room by ID (Public)
	 */
	@Query(() => RoomDto)
	@Public()
	public async getRoom(@Args('roomId') roomId: string): Promise<RoomDto> {
		try {
			this.logger.log('Query getRoom', roomId);
			return this.roomService.getRoom(roomId);
		} catch (error) {
			this.logger.error('Query getRoom failed', roomId, error);
			throw error;
		}
	}

	/**
	 * Get rooms by hotel ID (Public)
	 */
	@Query(() => RoomsDto)
	@Public()
	public async getRoomsByHotel(
		@Args('hotelId') hotelId: string,
		@Args('input') input: PaginationInput,
	): Promise<RoomsDto> {
		try {
			this.logger.log('Query getRoomsByHotel', hotelId, input.page);
			return this.roomService.getRoomsByHotel(hotelId, input);
		} catch (error) {
			this.logger.error('Query getRoomsByHotel failed', hotelId, input.page, error);
			throw error;
		}
	}

	/**
	 * Get agent's hotel rooms
	 */
	@Query(() => RoomsDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async getAgentRooms(
		@CurrentMember() currentMember: any,
		@Args('hotelId') hotelId: string,
		@Args('input') input: PaginationInput,
	): Promise<RoomsDto> {
		try {
			this.logger.log('Query getAgentRooms', currentMember?._id ?? 'unknown', hotelId);
			return this.roomService.getAgentRooms(currentMember, hotelId, input);
		} catch (error) {
			this.logger.error('Query getAgentRooms failed', currentMember?._id ?? 'unknown', hotelId, error);
			throw error;
		}
	}

	/**
	 * Get all rooms (admin only)
	 */
	@Query(() => RoomsDto)
	@Roles(MemberType.ADMIN)
	public async getAllRoomsAdmin(
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => RoomStatus, nullable: true }) statusFilter?: RoomStatus,
	): Promise<RoomsDto> {
		this.logger.log('Query getAllRoomsAdmin', statusFilter);
		return this.roomService.getAllRoomsAdmin(input, statusFilter);
	}

	/**
	 * Update room by admin (no ownership check)
	 */
	@Mutation(() => RoomDto)
	@Roles(MemberType.ADMIN)
	public async updateRoomByAdmin(@Args('input') input: RoomUpdate): Promise<RoomDto> {
		this.logger.log('Mutation updateRoomByAdmin', input._id);
		return this.roomService.updateRoomByAdmin(input);
	}
}
