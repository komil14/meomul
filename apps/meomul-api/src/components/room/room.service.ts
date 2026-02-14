import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RoomInput } from '../../libs/dto/room/room.input';
import { RoomUpdate } from '../../libs/dto/room/room.update';
import { RoomDto } from '../../libs/dto/room/room';
import { RoomsDto } from '../../libs/dto/common/rooms';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { RoomStatus } from '../../libs/enums/room.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { RoomDocument } from '../../libs/types/room';
import { toRoomDto } from '../../libs/types/room';
import type { HotelDocument } from '../../libs/types/hotel';

@Injectable()
export class RoomService {
	constructor(
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
	) {}

	/**
	 * Create a new room (AGENT or ADMIN only, must own the hotel)
	 */
	public async createRoom(currentMember: MemberJwtPayload, input: RoomInput): Promise<RoomDto> {
		// Only AGENT and ADMIN can create rooms
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Check member status
		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}

		// Verify hotel exists and belongs to the agent
		const hotel = await this.hotelModel.findById(input.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Check hotel ownership (only hotel owner can add rooms, unless admin)
		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Hotel must be active
		if (hotel.hotelStatus !== HotelStatus.ACTIVE && currentMember.memberType !== MemberType.ADMIN) {
			throw new BadRequestException('Hotel must be active to add rooms');
		}

		// Check for duplicate room number in the same hotel (if roomNumber is provided)
		if (input.roomNumber) {
			const existingRoom = await this.roomModel
				.findOne({
					hotelId: input.hotelId,
					roomNumber: input.roomNumber,
					roomStatus: { $ne: RoomStatus.INACTIVE },
				})
				.exec();

			if (existingRoom) {
				throw new BadRequestException(`Room number ${input.roomNumber} already exists in this hotel`);
			}
		}

		// Create room with availableRooms = totalRooms initially
		const room = await this.roomModel.create({
			...input,
			availableRooms: input.totalRooms,
			currentViewers: 0,
			roomStatus: RoomStatus.AVAILABLE,
		});

		return toRoomDto(room);
	}

	/**
	 * Update room by owner
	 */
	public async updateRoom(currentMember: MemberJwtPayload, input: RoomUpdate): Promise<RoomDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		// Find room
		const room = await this.roomModel.findById(input._id).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Find hotel to verify ownership
		const hotel = await this.hotelModel.findById(room.hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Check ownership (only hotel owner can update, unless admin)
		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Build update payload
		const updateData: Record<string, unknown> = { ...input };
		delete updateData._id;

		// If totalRooms is being updated, adjust availableRooms proportionally
		if (input.totalRooms && input.totalRooms !== room.totalRooms) {
			const bookedRooms = room.totalRooms - room.availableRooms;
			updateData.availableRooms = Math.max(0, input.totalRooms - bookedRooms);
		}

		// Update room
		const updatedRoom = await this.roomModel
			.findByIdAndUpdate(input._id, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedRoom) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toRoomDto(updatedRoom);
	}

	/**
	 * Get single room by ID
	 */
	public async getRoom(roomId: string): Promise<RoomDto> {
		const room = await this.roomModel.findById(roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only show available rooms to public
		if (room.roomStatus !== RoomStatus.AVAILABLE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toRoomDto(room);
	}

	/**
	 * Get rooms by hotel ID
	 */
	public async getRoomsByHotel(hotelId: string, input: PaginationInput): Promise<RoomsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			hotelId,
			roomStatus: RoomStatus.AVAILABLE,
		};

		const [list, total] = await Promise.all([
			this.roomModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.roomModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toRoomDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get agent's hotel rooms
	 */
	public async getAgentRooms(currentMember: MemberJwtPayload, hotelId: string, input: PaginationInput): Promise<RoomsDto> {
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Verify hotel ownership
		const hotel = await this.hotelModel.findById(hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			hotelId,
		};

		const [list, total] = await Promise.all([
			this.roomModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.roomModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toRoomDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get all rooms (admin only)
	 */
	public async getAllRoomsAdmin(input: PaginationInput, statusFilter?: RoomStatus): Promise<RoomsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {};
		if (statusFilter) {
			query.roomStatus = statusFilter;
		}

		const [list, total] = await Promise.all([
			this.roomModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.roomModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toRoomDto),
			metaCounter: { total },
		};
	}

	/**
	 * Update room by admin (no ownership check)
	 */
	public async updateRoomByAdmin(input: RoomUpdate): Promise<RoomDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		const room = await this.roomModel.findById(input._id).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const updateData: Record<string, unknown> = { ...input };
		delete updateData._id;

		if (input.totalRooms && input.totalRooms !== room.totalRooms) {
			const bookedRooms = room.totalRooms - room.availableRooms;
			updateData.availableRooms = Math.max(0, input.totalRooms - bookedRooms);
		}

		const updatedRoom = await this.roomModel
			.findByIdAndUpdate(input._id, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedRoom) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toRoomDto(updatedRoom);
	}

	/**
	 * Update room availability (for booking system)
	 */
	public async updateAvailability(roomId: string, change: number): Promise<void> {
		const room = await this.roomModel.findById(roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const newAvailable = room.availableRooms + change;

		// Validate availability
		if (newAvailable < 0) {
			throw new BadRequestException('Not enough rooms available');
		}

		if (newAvailable > room.totalRooms) {
			throw new BadRequestException('Available rooms cannot exceed total rooms');
		}

		await this.roomModel.findByIdAndUpdate(roomId, { availableRooms: newAvailable }).exec();
	}

	/**
	 * Increment viewer count (WebSocket)
	 */
	public async incrementViewers(roomId: string): Promise<void> {
		await this.roomModel.findByIdAndUpdate(roomId, { $inc: { currentViewers: 1 } }).exec();
	}

	/**
	 * Decrement viewer count (WebSocket)
	 */
	public async decrementViewers(roomId: string): Promise<void> {
		await this.roomModel.findByIdAndUpdate(roomId, { $inc: { currentViewers: -1 } }).exec();
	}

	/**
	 * Create last-minute deal (for batch job)
	 */
	public async createLastMinuteDeal(
		roomId: string,
		discountPercent: number,
		validUntil: Date,
	): Promise<RoomDto> {
		const room = await this.roomModel.findById(roomId).exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const dealPrice = Math.round(room.basePrice * (1 - discountPercent / 100));

		const updatedRoom = await this.roomModel
			.findByIdAndUpdate(
				roomId,
				{
					lastMinuteDeal: {
						isActive: true,
						discountPercent,
						originalPrice: room.basePrice,
						dealPrice,
						validUntil,
					},
				},
				{ returnDocument: 'after' },
			)
			.exec();

		if (!updatedRoom) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toRoomDto(updatedRoom);
	}

	/**
	 * Expire last-minute deal (for batch job)
	 */
	public async expireLastMinuteDeal(roomId: string): Promise<void> {
		await this.roomModel
			.findByIdAndUpdate(roomId, {
				$unset: { lastMinuteDeal: 1 },
			})
			.exec();
	}
}
