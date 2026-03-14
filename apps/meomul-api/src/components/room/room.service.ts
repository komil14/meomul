import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import { RoomInput } from '../../libs/dto/room/room.input';
import { RoomUpdate } from '../../libs/dto/room/room.update';
import { RoomDto } from '../../libs/dto/room/room';
import { RoomsDto } from '../../libs/dto/common/rooms';
import { HomeLastMinuteDealDto } from '../../libs/dto/home/home';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { RoomStatus } from '../../libs/enums/room.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { RoomDocument } from '../../libs/types/room';
import { toRoomDto } from '../../libs/types/room';
import type { HotelDocument } from '../../libs/types/hotel';
import { assertApprovedHostAccess } from '../../libs/utils/member-access';
import { RoomInventoryService } from '../room-inventory/room-inventory.service';

@Injectable()
export class RoomService {
	constructor(
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		private readonly roomInventoryService: RoomInventoryService,
	) {}

	/**
	 * Create a new room (AGENT or ADMIN only, must own the hotel)
	 */
	public async createRoom(currentMember: MemberJwtPayload, input: RoomInput): Promise<RoomDto> {
		// Only AGENT and ADMIN can create rooms
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
		assertApprovedHostAccess(currentMember);

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
		if (String(hotel.memberId) !== String(currentMember._id) && currentMember.memberType !== MemberType.ADMIN) {
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

		await this.roomInventoryService.seedRoomInventory({
			roomId: room._id.toString(),
			totalRooms: room.totalRooms,
			basePrice: room.basePrice,
			startDate: new Date(),
			days: 365,
		});
		await this.syncHotelStartingPrice(String(room.hotelId));

		return toRoomDto(room);
	}

	/**
	 * Update room by owner
	 */
	public async updateRoom(currentMember: MemberJwtPayload, input: RoomUpdate): Promise<RoomDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}
		if (currentMember.memberType === MemberType.AGENT) {
			assertApprovedHostAccess(currentMember);
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
		if (String(hotel.memberId) !== String(currentMember._id) && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Build update payload
		const updateData: Record<string, unknown> = { ...input };
		delete updateData._id;
		const shouldSyncTotalRooms = input.totalRooms !== undefined && input.totalRooms !== room.totalRooms;
		const shouldSyncBasePrice = input.basePrice !== undefined && input.basePrice !== room.basePrice;

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

		await this.syncFutureInventoryAfterRoomUpdate(updatedRoom._id.toString(), {
			totalRooms: shouldSyncTotalRooms ? updatedRoom.totalRooms : undefined,
			basePrice: shouldSyncBasePrice ? updatedRoom.basePrice : undefined,
		});
		await this.syncHotelStartingPrice(String(updatedRoom.hotelId));

		return toRoomDto(updatedRoom);
	}

	/**
	 * Get single room by ID
	 */
	public async getRoom(roomId: string): Promise<RoomDto> {
		const room = await this.roomModel.findById(roomId).lean().exec();
		if (!room) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		await this.ensureHotelIsPubliclyAvailable(String(room.hotelId));

		// Only show available rooms to public; legacy documents may miss roomStatus.
		if (room.roomStatus && room.roomStatus !== RoomStatus.AVAILABLE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const roomDto = toRoomDto(room);
		const availableRoomsToday = await this.roomInventoryService.getAvailableRoomsOnDate(roomId, new Date());
		if (availableRoomsToday !== null) {
			roomDto.availableRooms = availableRoomsToday;
		}

		return roomDto;
	}

	/**
	 * Get rooms by hotel ID
	 */
	public async getRoomsByHotel(hotelId: string, input: PaginationInput): Promise<RoomsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		await this.ensureHotelIsPubliclyAvailable(hotelId);

		const query: Record<string, unknown> = {
			hotelId: hotelId,
			$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
		};

		const [list, total] = await Promise.all([
			this.roomModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.lean()
				.exec(),
			this.roomModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toRoomDto),
			metaCounter: { total },
		};
	}

	/**
	 * Homepage last-minute deals (single query, no client fan-out).
	 */
	public async getHomeLastMinuteDeals(limit: number = 8): Promise<HomeLastMinuteDealDto[]> {
		const safeLimit = Math.max(1, Math.min(limit, 30));
		const candidateLimit = safeLimit * 6;
		const now = new Date();

		const rooms = await this.roomModel
			.find({
				$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
				'lastMinuteDeal.isActive': true,
				'lastMinuteDeal.validUntil': { $gt: now },
			})
			.sort({
				'lastMinuteDeal.discountPercent': -1,
				'lastMinuteDeal.validUntil': 1,
				updatedAt: -1,
			})
			.limit(candidateLimit)
			.lean()
			.exec();

		if (rooms.length === 0) {
			return [];
		}

		const hotelIds = Array.from(new Set(rooms.map((room) => String(room.hotelId))));
		const hotels = await this.hotelModel
			.find({
				_id: { $in: hotelIds },
				hotelStatus: HotelStatus.ACTIVE,
			})
			.select('_id hotelTitle hotelLocation hotelImages')
			.lean()
			.exec();

		const hotelsById = new Map<string, HotelDocument>(hotels.map((hotel) => [String(hotel._id), hotel]));

		const list: HomeLastMinuteDealDto[] = [];
		for (const room of rooms) {
			const deal = room.lastMinuteDeal;
			if (!deal?.isActive || deal.validUntil <= now) {
				continue;
			}

			const hotel = hotelsById.get(String(room.hotelId));
			if (!hotel) {
				continue;
			}

			list.push({
				roomId: room._id.toString(),
				hotelId: String(room.hotelId),
				hotelTitle: hotel.hotelTitle,
				hotelLocation: String(hotel.hotelLocation),
				roomName: room.roomName,
				roomType: String(room.roomType),
				imageUrl: room.roomImages?.[0] ?? hotel.hotelImages?.[0] ?? '',
				basePrice: deal.originalPrice ?? room.basePrice,
				dealPrice: deal.dealPrice ?? room.basePrice,
				discountPercent: deal.discountPercent ?? 0,
				validUntil: deal.validUntil,
			});

			if (list.length >= safeLimit) {
				break;
			}
		}

		return list;
	}

	public async ensureHomeLastMinuteDeals(targetCount: number = 8): Promise<number> {
		const safeTarget = Math.max(1, Math.min(targetCount, 20));
		const now = new Date();

		await this.roomModel
			.updateMany(
				{
					'lastMinuteDeal.isActive': true,
					'lastMinuteDeal.validUntil': { $lte: now },
				},
				{
					$unset: { lastMinuteDeal: 1 },
				},
			)
			.exec();

		const activeHotels = await this.hotelModel
			.find({ hotelStatus: HotelStatus.ACTIVE })
			.select('_id')
			.lean()
			.exec();
		const activeHotelIds = activeHotels.map((hotel) => hotel._id);
		if (activeHotelIds.length === 0) {
			return 0;
		}

		const activeDealRooms = await this.roomModel
			.find({
				hotelId: { $in: activeHotelIds },
				$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
				availableRooms: { $gt: 0 },
				'lastMinuteDeal.isActive': true,
				'lastMinuteDeal.validUntil': { $gt: now },
			})
			.select('_id hotelId')
			.lean()
			.exec();

		if (activeDealRooms.length >= safeTarget) {
			return 0;
		}

		const hotelDealCounts = new Map<string, number>();
		activeDealRooms.forEach((room) => {
			const hotelId = String(room.hotelId);
			hotelDealCounts.set(hotelId, (hotelDealCounts.get(hotelId) ?? 0) + 1);
		});

		const candidateRooms = await this.roomModel
			.find({
				hotelId: { $in: activeHotelIds },
				$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
				availableRooms: { $gt: 0 },
				basePrice: { $gt: 0 },
				$and: [
					{
						$or: [
							{ lastMinuteDeal: { $exists: false } },
							{ 'lastMinuteDeal.isActive': { $ne: true } },
							{ 'lastMinuteDeal.validUntil': { $lte: now } },
						],
					},
				],
			})
			.sort({
				currentViewers: -1,
				updatedAt: -1,
				basePrice: -1,
			})
			.limit(safeTarget * 8)
			.exec();

		if (candidateRooms.length === 0) {
			return 0;
		}

		const updates: Promise<unknown>[] = [];
		let createdCount = 0;
		for (const room of candidateRooms) {
			if (activeDealRooms.length + createdCount >= safeTarget) {
				break;
			}

			const hotelId = String(room.hotelId);
			const hotelCount = hotelDealCounts.get(hotelId) ?? 0;
			if (hotelCount >= 2) {
				continue;
			}

			const discountPercent = this.computeHomeDealDiscount(String(room._id));
			const validUntil = this.computeHomeDealValidUntil(now, String(room._id));
			const dealPrice = Math.round(room.basePrice * (1 - discountPercent / 100));

			updates.push(
				this.roomModel
					.updateOne(
						{ _id: room._id },
						{
							$set: {
								lastMinuteDeal: {
									isActive: true,
									discountPercent,
									originalPrice: room.basePrice,
									dealPrice,
									validUntil,
								},
							},
						},
					)
					.exec(),
			);
			hotelDealCounts.set(hotelId, hotelCount + 1);
			createdCount += 1;
		}

		if (updates.length > 0) {
			await Promise.all(updates);
		}

		return createdCount;
	}

	/**
	 * Get agent's hotel rooms
	 */
	public async getAgentRooms(
		currentMember: MemberJwtPayload,
		hotelId: string,
		input: PaginationInput,
	): Promise<RoomsDto> {
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}
		assertApprovedHostAccess(currentMember);

		// Verify hotel ownership
		const hotel = await this.hotelModel.findById(hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		if (String(hotel.memberId) !== String(currentMember._id) && currentMember.memberType !== MemberType.ADMIN) {
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
				.lean()
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
				.lean()
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
		const shouldSyncTotalRooms = input.totalRooms !== undefined && input.totalRooms !== room.totalRooms;
		const shouldSyncBasePrice = input.basePrice !== undefined && input.basePrice !== room.basePrice;

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

		await this.syncFutureInventoryAfterRoomUpdate(updatedRoom._id.toString(), {
			totalRooms: shouldSyncTotalRooms ? updatedRoom.totalRooms : undefined,
			basePrice: shouldSyncBasePrice ? updatedRoom.basePrice : undefined,
		});
		await this.syncHotelStartingPrice(String(updatedRoom.hotelId));

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
	 * @deprecated Live viewer presence is handled in-memory by RoomViewersGateway.
	 * Kept as no-op to avoid persisting ephemeral presence in MongoDB.
	 */
	public incrementViewers(roomId: string): Promise<void> {
		void roomId;
		return Promise.resolve();
	}

	/**
	 * @deprecated Live viewer presence is handled in-memory by RoomViewersGateway.
	 * Kept as no-op to avoid persisting ephemeral presence in MongoDB.
	 */
	public decrementViewers(roomId: string): Promise<void> {
		void roomId;
		return Promise.resolve();
	}

	/**
	 * Create last-minute deal (for batch job)
	 */
	public async createLastMinuteDeal(roomId: string, discountPercent: number, validUntil: Date): Promise<RoomDto> {
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

	private async syncFutureInventoryAfterRoomUpdate(
		roomId: string,
		input: { totalRooms?: number; basePrice?: number },
	): Promise<void> {
		if (input.totalRooms === undefined && input.basePrice === undefined) {
			return;
		}

		await this.roomInventoryService.syncFutureInventoryDefaults({
			roomId,
			startDate: new Date(),
			totalRooms: input.totalRooms,
			basePrice: input.basePrice,
		});
	}

	private async syncHotelStartingPrice(hotelId: string): Promise<void> {
		const hotelObjectId = new Types.ObjectId(hotelId);
		const [result] = await this.roomModel
			.aggregate<{ minPrice: number }>([
				{
					$match: {
						hotelId: hotelObjectId,
						$or: [{ roomStatus: RoomStatus.AVAILABLE }, { roomStatus: { $exists: false } }],
					},
				},
				{
					$group: {
						_id: null,
						minPrice: { $min: '$basePrice' },
					},
				},
			])
			.exec();

		await this.hotelModel
			.updateOne(
				{ _id: hotelObjectId },
				{
					$set: {
						startingPrice: Math.max(0, Math.round(result?.minPrice ?? 0)),
					},
				},
			)
			.exec();
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

	private computeHomeDealDiscount(seedValue: string): number {
		const seed = Array.from(seedValue).reduce((total, char) => total + char.charCodeAt(0), 0);
		return 12 + (seed % 15);
	}

	private computeHomeDealValidUntil(now: Date, seedValue: string): Date {
		const seed = Array.from(seedValue).reduce((total, char) => total + char.charCodeAt(0), 0);
		const hours = 8 + (seed % 10);
		return new Date(now.getTime() + hours * 60 * 60 * 1000);
	}

	private async ensureHotelIsPubliclyAvailable(hotelId: string): Promise<void> {
		const hotel = await this.hotelModel
			.findById(hotelId)
			.select('hotelStatus')
			.lean()
			.exec();

		if (!hotel || hotel.hotelStatus !== HotelStatus.ACTIVE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}
	}
}
