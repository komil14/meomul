import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { HotelInput } from '../../libs/dto/hotel/hotel.input';
import { HotelUpdate } from '../../libs/dto/hotel/hotel.update';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import { HotelsDto } from '../../libs/dto/common/hotels';
import { Direction, MetaCounterDto, PaginationInput } from '../../libs/dto/common/pagination';
import { HotelSearchInput } from '../../libs/dto/common/search.input';
import { HotelStatus, BadgeLevel } from '../../libs/enums/hotel.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { RoomStatus } from '../../libs/enums/room.enum';
import { StayPurpose, ViewGroup } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { HotelDocument } from '../../libs/types/hotel';
import { toHotelDto } from '../../libs/types/hotel';
import type { RoomDocument } from '../../libs/types/room';
import type { SearchHistoryDocument } from '../../libs/types/search-history';
import type { RoomInventoryDocument } from '../../libs/types/room-inventory';
import { ViewService } from '../view/view.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/common.enum';
import { RoomInventoryService } from '../room-inventory/room-inventory.service';

@Injectable()
export class HotelService {
	private readonly searchHistoryDedupeWindowMs = 5 * 60 * 1000;

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Room') private readonly roomModel: Model<RoomDocument>,
		@InjectModel('SearchHistory') private readonly searchHistoryModel: Model<SearchHistoryDocument>,
		@InjectModel('RoomInventory') private readonly roomInventoryModel: Model<RoomInventoryDocument>,
		private readonly viewService: ViewService,
		private readonly notificationService: NotificationService,
		private readonly roomInventoryService: RoomInventoryService,
	) {}

	/**
	 * Create a new hotel (AGENT or ADMIN only)
	 */
	public async createHotel(currentMember: MemberJwtPayload, input: HotelInput): Promise<HotelDto> {
		// Only AGENT and ADMIN can create hotels
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Check member status
		if (currentMember.memberStatus !== MemberStatus.ACTIVE) {
			throw new ForbiddenException(Messages.NOT_AUTHENTICATED);
		}

		// Check for duplicate hotel (same title + location + address)
		const existingHotel = await this.hotelModel
			.findOne({
				hotelTitle: input.hotelTitle,
				hotelLocation: input.hotelLocation,
				'detailedLocation.address': input.detailedLocation.address,
				hotelStatus: { $ne: HotelStatus.DELETE },
			})
			.exec();

		if (existingHotel) {
			throw new BadRequestException('A hotel with this title and address already exists in this location');
		}

		// Calculate Safe Stay Certification
		const safeStayCertified = this.calculateSafeStayCertification(
			input.safetyFeatures as unknown as Record<string, unknown>,
		);

		// Calculate suitable purposes based on amenities
		const suitableFor = input.suitableFor?.length
			? input.suitableFor
			: this.calculateSuitableFor(input.amenities as unknown as Record<string, unknown>);

		// Create hotel
		const hotel = await this.hotelModel.create({
			...input,
			memberId: currentMember._id,
			safeStayCertified,
			suitableFor,
			hotelStatus: HotelStatus.PENDING,
			verificationStatus: 'PENDING',
			badgeLevel: BadgeLevel.NONE,
		});

		// Notify admins (fire-and-forget)
		this.notificationService
			.notifyAdmins(
				NotificationType.NEW_HOTEL,
				'New Hotel Registered',
				`"${hotel.hotelTitle}" was registered by agent`,
				`/admin/hotels/${hotel._id.toString()}`,
			)
			.catch(() => {});

		return toHotelDto(hotel);
	}

	/**
	 * Update hotel by owner (AGENT)
	 */
	public async updateHotel(currentMember: MemberJwtPayload, input: HotelUpdate): Promise<HotelDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		// Find hotel
		const hotel = await this.hotelModel.findById(input._id).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Check ownership (only hotel owner can update, unless admin)
		if (String(hotel.memberId) !== String(currentMember._id) && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Build update payload (remove admin-only fields)
		const updateData = this.buildUpdatePayload(input, false);

		// Recalculate safe stay certification if safety features changed
		if (input.safetyFeatures) {
			updateData.safeStayCertified = this.calculateSafeStayCertification(
				input.safetyFeatures as unknown as Record<string, unknown>,
			);
		}

		// Recalculate suitable purposes if amenities changed
		if (input.amenities && !input.suitableFor) {
			updateData.suitableFor = this.calculateSuitableFor(input.amenities as unknown as Record<string, unknown>);
		}

		// Update hotel
		const updatedHotel = await this.hotelModel
			.findByIdAndUpdate(input._id, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedHotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		return toHotelDto(updatedHotel);
	}

	/**
	 * Update hotel by admin (full access)
	 */
	public async updateHotelByAdmin(input: HotelUpdate): Promise<HotelDto> {
		if (!input._id) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		// Find hotel
		const hotel = await this.hotelModel.findById(input._id).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// If activating a hotel, ensure it has at least 3 images
		if (input.hotelStatus === HotelStatus.ACTIVE) {
			const images = input.hotelImages ?? hotel.hotelImages ?? [];
			if (images.length < 3) {
				throw new BadRequestException('Hotel must have at least 3 images before it can be made active');
			}
		}

		// Build update payload (allow admin-only fields)
		const updateData = this.buildUpdatePayload(input, true);

		// Update hotel
		const updatedHotel = await this.hotelModel
			.findByIdAndUpdate(input._id, updateData, { returnDocument: 'after' })
			.exec();

		if (!updatedHotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Notify hotel agent if status changed (fire-and-forget)
		if (input.hotelStatus && input.hotelStatus !== hotel.hotelStatus && hotel.memberId) {
			const statusLabels: Record<string, string> = {
				ACTIVE: 'Your hotel is now live and visible to guests!',
				SUSPENDED: 'Your hotel has been suspended. Contact support for details.',
				CLOSED: 'Your hotel listing has been closed by an administrator.',
				PENDING: 'Your hotel listing is now under review.',
			};
			this.notificationService
				.createAndPush(
					{
						userId: String(hotel.memberId),
						type: NotificationType.NEW_HOTEL,
						title: `Hotel ${input.hotelStatus}`,
						message: statusLabels[input.hotelStatus] ?? `Hotel status updated to ${input.hotelStatus}.`,
						link: `/hotels/${String(hotel._id)}`,
					},
					'HOTEL',
				)
				.catch(() => {});
		}

		return toHotelDto(updatedHotel);
	}

	/**
	 * Get single hotel by ID
	 */
	public async getHotel(hotelId: string, currentMember?: MemberJwtPayload): Promise<HotelDto> {
		const hotel = await this.hotelModel.findById(hotelId).lean().exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		const isOwner = !!currentMember && String(hotel.memberId) === String(currentMember._id);
		const isAdmin =
			currentMember?.memberType === MemberType.ADMIN ||
			currentMember?.memberType === MemberType.ADMIN_OPERATOR;

		// Public users can only see ACTIVE hotels. Owners/admins can view their non-active listings.
		if (hotel.hotelStatus !== HotelStatus.ACTIVE && !isOwner && !isAdmin) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Track views only for active hotels and authenticated users.
		if (currentMember && hotel.hotelStatus === HotelStatus.ACTIVE) {
			const result = await this.viewService.recordView(currentMember, {
				viewGroup: ViewGroup.HOTEL,
				viewRefId: hotelId,
			});

			// Only increment count for NEW views (not repeat views from same user)
			if (result.isNewView) {
				await this.hotelModel.findByIdAndUpdate(hotelId, { $inc: { hotelViews: 1 } }).exec();
				hotel.hotelViews = (hotel.hotelViews ?? 0) + 1;
				this.invalidateRecCache(currentMember._id);
			}
		}

		return toHotelDto(hotel);
	}

	/**
	 * Get hotels with search and filters
	 */
	public async getHotels(
		input: PaginationInput,
		searchInput?: HotelSearchInput,
		currentMember?: MemberJwtPayload,
	): Promise<HotelsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		// Fire-and-forget: log meaningful searches for recommendations, with duplicate suppression.
		if (currentMember?._id && searchInput) {
			this.logSearchHistory(currentMember._id, searchInput).catch(() => {});
		}

		const query = await this.buildHotelsListingQuery(searchInput);
		if (!query) {
			return { list: [], metaCounter: { total: 0 } };
		}

		// Execute query
		const [list, total] = await Promise.all([
			this.hotelModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.lean()
				.exec(),
			this.hotelModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toHotelDto),
			metaCounter: { total },
		};
	}

	public async getHotelsCount(searchInput?: HotelSearchInput): Promise<MetaCounterDto> {
		const query = await this.buildHotelsListingQuery(searchInput);
		if (!query) {
			return { total: 0 };
		}

		const total = await this.hotelModel.countDocuments(query).exec();

		return { total };
	}

	private async buildHotelsListingQuery(searchInput?: HotelSearchInput): Promise<Record<string, unknown> | null> {
		const query = this.buildSearchQuery(searchInput);

		if (searchInput?.purpose) {
			const purposeFilter = this.getPurposeFilter(searchInput.purpose);
			if (purposeFilter) {
				this.appendAndFilter(query, purposeFilter);
			}
		}

		const needsRoomFilter =
			searchInput?.priceRange || searchInput?.roomTypes?.length || searchInput?.guestCount || searchInput?.checkInDate;

		if (needsRoomFilter && searchInput) {
			const qualifyingHotelIds = await this.getHotelIdsByRoomFilters(searchInput);
			if (qualifyingHotelIds.length === 0) {
				return null;
			}
			query._id = { $in: qualifyingHotelIds };
		}

		return query;
	}

	private invalidateRecCache(memberId: string): void {
		const versionKey = `rec:v:${memberId}`;
		const nextVersion = Date.now().toString();
		Promise.all([
			this.cacheManager.set(versionKey, nextVersion, 7 * 24 * 60 * 60 * 1000),
			this.cacheManager.del(`rec:${memberId}:10`), // legacy keys
			this.cacheManager.del(`rec:${memberId}:20`), // legacy keys
		]).catch(() => {});
	}

	private async logSearchHistory(memberId: string, searchInput: HotelSearchInput): Promise<void> {
		const payload = this.buildSearchHistoryPayload(searchInput);
		if (!payload) {
			return;
		}

		const fingerprint = this.buildSearchFingerprint(searchInput);
		const cutoffDate = new Date(Date.now() - this.searchHistoryDedupeWindowMs);

		const duplicateEntry = await this.searchHistoryModel
			.findOne({
				memberId,
				fingerprint,
				createdAt: { $gte: cutoffDate },
			})
			.select('_id')
			.lean()
			.exec();

		if (duplicateEntry) {
			return;
		}

		await this.searchHistoryModel.create({
			memberId,
			fingerprint,
			...payload,
		});

		this.invalidateRecCache(memberId);
	}

	private buildSearchHistoryPayload(searchInput: HotelSearchInput): Record<string, unknown> | null {
		const payload = {
			location: searchInput.location,
			hotelTypes: this.normalizeStringArray(searchInput.hotelTypes),
			priceMin: searchInput.priceRange?.start,
			priceMax: searchInput.priceRange?.end,
			purpose: searchInput.purpose,
			amenities: this.normalizeStringArray(searchInput.amenities),
			starRatings: this.normalizeNumberArray(searchInput.starRatings),
			guestCount: searchInput.guestCount,
			text: this.normalizeSearchText(searchInput.text) ?? undefined,
		};

		const hasMeaningfulSignal =
			Boolean(payload.location) ||
			payload.hotelTypes.length > 0 ||
			payload.priceMin !== undefined ||
			payload.priceMax !== undefined ||
			Boolean(payload.purpose) ||
			payload.amenities.length > 0 ||
			payload.starRatings.length > 0 ||
			payload.guestCount !== undefined ||
			Boolean(payload.text);

		return hasMeaningfulSignal ? payload : null;
	}

	private buildSearchFingerprint(searchInput: HotelSearchInput): string {
		return JSON.stringify({
			location: searchInput.location ?? null,
			dong: this.normalizeQueryText(searchInput.dong),
			nearestSubway: this.normalizeQueryText(searchInput.nearestSubway),
			subwayLines: this.normalizeNumberArray(searchInput.subwayLines),
			maxWalkingDistance: searchInput.maxWalkingDistance ?? null,
			hotelTypes: this.normalizeStringArray(searchInput.hotelTypes),
			roomTypes: this.normalizeStringArray(searchInput.roomTypes),
			priceStart: searchInput.priceRange?.start ?? null,
			priceEnd: searchInput.priceRange?.end ?? null,
			starRatings: this.normalizeNumberArray(searchInput.starRatings),
			minRating: searchInput.minRating ?? null,
			amenities: this.normalizeStringArray(searchInput.amenities),
			verifiedOnly: Boolean(searchInput.verifiedOnly),
			purpose: searchInput.purpose ?? null,
			checkInDate: this.normalizeDateValue(searchInput.checkInDate),
			checkOutDate: this.normalizeDateValue(searchInput.checkOutDate),
			guestCount: searchInput.guestCount ?? null,
			petsAllowed: Boolean(searchInput.petsAllowed),
			wheelchairAccessible: Boolean(searchInput.wheelchairAccessible),
			text: this.normalizeSearchText(searchInput.text),
		});
	}

	/**
	 * Get agent's own hotels
	 */
	public async getAgentHotels(currentMember: MemberJwtPayload, input: PaginationInput): Promise<HotelsDto> {
		if (currentMember.memberType !== MemberType.AGENT && currentMember.memberType !== MemberType.ADMIN) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			memberId: currentMember._id,
			hotelStatus: { $ne: HotelStatus.DELETE },
		};

		const [list, total] = await Promise.all([
			this.hotelModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.lean()
				.exec(),
			this.hotelModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toHotelDto),
			metaCounter: { total },
		};
	}

	/**
	 * Get all hotels (admin only) — includes PENDING, INACTIVE, SUSPENDED
	 */
	public async getAllHotelsAdmin(input: PaginationInput, statusFilter?: HotelStatus): Promise<HotelsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		const query: Record<string, unknown> = {
			hotelStatus: { $ne: HotelStatus.DELETE },
		};
		if (statusFilter) {
			query.hotelStatus = statusFilter;
		}

		const [list, total] = await Promise.all([
			this.hotelModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.lean()
				.exec(),
			this.hotelModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toHotelDto),
			metaCounter: { total },
		};
	}

	/**
	 * Find hotel IDs that have rooms matching price range, room types, guest count, and date availability
	 */
	private async getHotelIdsByRoomFilters(searchInput: HotelSearchInput): Promise<Types.ObjectId[]> {
		const roomQuery: Record<string, unknown> = {
			roomStatus: RoomStatus.AVAILABLE,
		};

		// Price range filter
		if (searchInput.priceRange) {
			const priceFilter: Record<string, number> = {};
			if (searchInput.priceRange.start !== undefined) {
				priceFilter.$gte = searchInput.priceRange.start;
			}
			if (searchInput.priceRange.end !== undefined) {
				priceFilter.$lte = searchInput.priceRange.end;
			}
			if (Object.keys(priceFilter).length > 0) {
				roomQuery.basePrice = priceFilter;
			}
		}

		// Room type filter
		if (searchInput.roomTypes?.length) {
			roomQuery.roomType = { $in: searchInput.roomTypes };
		}

		// Guest count filter (room must accommodate at least this many guests)
		if (searchInput.guestCount) {
			roomQuery.maxOccupancy = { $gte: searchInput.guestCount };
		}

		// Find matching rooms and get distinct hotel IDs
		const matchingRooms = await this.roomModel.find(roomQuery).select('hotelId _id totalRooms basePrice').lean().exec();

		if (matchingRooms.length === 0) {
			return [];
		}

		// Date availability filter — room must have at least 1 available unit for every night in range.
		if (searchInput.checkInDate && searchInput.checkOutDate) {
			const checkIn = new Date(searchInput.checkInDate);
			const checkOut = new Date(searchInput.checkOutDate);
			const stayDates = this.buildStayDates(checkIn, checkOut);
			if (stayDates.length === 0) {
				return [];
			}

			// Ensure requested date rows exist before running availability query.
			await Promise.all(
				matchingRooms.map((room) =>
					this.roomInventoryService.seedRoomInventory({
						roomId: String(room._id),
						totalRooms: room.totalRooms,
						basePrice: room.basePrice,
						startDate: checkIn,
						days: stayDates.length,
					}),
				),
			);

			const roomIds = matchingRooms.map((r) => r._id);
			const availableRoomRows = await this.roomInventoryModel
				.aggregate<{ _id: Types.ObjectId; availableDays: number }>([
					{
						$match: {
							roomId: { $in: roomIds },
							date: { $in: stayDates },
							closed: false,
							$expr: {
								$gt: [{ $subtract: ['$total', '$booked'] }, 0],
							},
						},
					},
					{
						$group: {
							_id: '$roomId',
							availableDays: { $sum: 1 },
						},
					},
					{
						$match: {
							availableDays: stayDates.length,
						},
					},
				])
				.exec();

			const availableRoomIdSet = new Set(availableRoomRows.map((row) => String(row._id)));
			const availableHotelIds = new Set<string>();
			for (const room of matchingRooms) {
				if (availableRoomIdSet.has(String(room._id))) {
					availableHotelIds.add(String(room.hotelId));
				}
			}

			return Array.from(availableHotelIds).map((id) => new Types.ObjectId(id));
		}

		// No date filter — just return distinct hotel IDs from matching rooms
		const hotelIdSet = new Set<string>();
		for (const room of matchingRooms) {
			hotelIdSet.add(String(room.hotelId));
		}
		return Array.from(hotelIdSet).map((id) => new Types.ObjectId(id));
	}

	/**
	 * Build search query from search input
	 */
	private buildSearchQuery(searchInput?: HotelSearchInput): Record<string, unknown> {
		const query: Record<string, unknown> = {
			hotelStatus: HotelStatus.ACTIVE,
		};

		if (!searchInput) return query;

		// Location filters
		if (searchInput.location) {
			query.hotelLocation = searchInput.location;
		}

		if (searchInput.dong) {
			query['detailedLocation.dong'] = searchInput.dong;
		}

		if (searchInput.nearestSubway) {
			query['detailedLocation.nearestSubway'] = searchInput.nearestSubway;
		}

		if (searchInput.subwayLines?.length) {
			query['detailedLocation.subwayLines'] = { $in: searchInput.subwayLines };
		}

		if (searchInput.maxWalkingDistance) {
			query['detailedLocation.walkingDistance'] = { $lte: searchInput.maxWalkingDistance };
		}

		// Hotel type filter
		if (searchInput.hotelTypes?.length) {
			query.hotelType = { $in: searchInput.hotelTypes };
		}

		// Star rating filter
		if (searchInput.starRatings?.length) {
			query.starRating = { $in: searchInput.starRatings };
		}

		// Minimum rating filter
		if (searchInput.minRating) {
			query.hotelRating = { $gte: searchInput.minRating };
		}

		// Verified only
		if (searchInput.verifiedOnly) {
			query.badgeLevel = { $in: [BadgeLevel.VERIFIED, BadgeLevel.INSPECTED, BadgeLevel.SUPERHOST] };
		}

		// Pets allowed
		if (searchInput.petsAllowed) {
			query.petsAllowed = true;
		}

		// Wheelchair accessible
		if (searchInput.wheelchairAccessible) {
			query['amenities.wheelchairAccessible'] = true;
		}

		// Amenities filter
		if (searchInput.amenities?.length) {
			searchInput.amenities.forEach((amenity) => {
				query[`amenities.${amenity}`] = true;
			});
		}

		// Text search uses MongoDB text index instead of regex scans.
		const normalizedSearchText = this.normalizeSearchText(searchInput.text);
		if (normalizedSearchText) {
			this.appendAndFilter(query, {
				$text: { $search: normalizedSearchText },
			});
		}

		return query;
	}

	/**
	 * Return purpose-based filter (BUSINESS, ROMANTIC, FAMILY, etc.)
	 */
	private getPurposeFilter(purpose: StayPurpose): Record<string, unknown> | null {
		switch (purpose) {
			case StayPurpose.BUSINESS:
				// Workspace, WiFi, Meeting room
				return {
					'amenities.workspace': true,
					'amenities.wifi': true,
				};

			case StayPurpose.ROMANTIC:
				// Couple room, romantic view, private bath
				return {
					$or: [
						{ 'amenities.coupleRoom': true },
						{ 'amenities.romanticView': true },
						{ 'amenities.privateBath': true },
					],
				};

			case StayPurpose.FAMILY:
				// Family room, kids friendly, playground
				return {
					$or: [{ 'amenities.familyRoom': true }, { 'amenities.kidsFriendly': true }, { 'amenities.playground': true }],
				};

			case StayPurpose.SOLO:
				// Safe, accessible, 24/7 front desk
				return { 'safetyFeatures.frontDesk24h': true };

			case StayPurpose.STAYCATION:
				// Pool, spa, room service, restaurant
				return {
					$or: [
						{ 'amenities.pool': true },
						{ 'amenities.spa': true },
						{ 'amenities.roomService': true },
						{ 'amenities.restaurant': true },
					],
				};

			default:
				return null;
		}
	}

	private appendAndFilter(query: Record<string, unknown>, condition: Record<string, unknown>): void {
		const andFilters = (query.$and as Record<string, unknown>[] | undefined) ?? [];
		query.$and = [...andFilters, condition];
	}

	private normalizeQueryText(text?: string): string | null {
		if (!text) {
			return null;
		}

		const normalized = text.trim().split(/\s+/).filter(Boolean).join(' ');

		return normalized.length ? normalized : null;
	}

	private normalizeSearchText(text?: string): string | null {
		return this.normalizeQueryText(text);
	}

	private normalizeStringArray(values?: Array<string | number>): string[] {
		if (!values?.length) {
			return [];
		}

		return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).sort((left, right) =>
			left.localeCompare(right),
		);
	}

	private normalizeNumberArray(values?: number[]): number[] {
		if (!values?.length) {
			return [];
		}

		return Array.from(new Set(values)).sort((left, right) => left - right);
	}

	private normalizeDateValue(date?: Date): string | null {
		if (!date) {
			return null;
		}

		const normalizedDate = new Date(date);
		return Number.isNaN(normalizedDate.getTime()) ? null : normalizedDate.toISOString().slice(0, 10);
	}

	private buildStayDates(checkInDate: Date, checkOutDate: Date): Date[] {
		const start = this.normalizeToUtcDay(checkInDate);
		const end = this.normalizeToUtcDay(checkOutDate);
		if (end <= start) {
			return [];
		}

		const dates: Date[] = [];
		const current = new Date(start);
		while (current < end) {
			dates.push(new Date(current));
			current.setUTCDate(current.getUTCDate() + 1);
		}

		return dates;
	}

	private normalizeToUtcDay(date: Date): Date {
		return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
	}

	/**
	 * Calculate Safe Stay Certification (4+ safety features)
	 */
	private calculateSafeStayCertification(safetyFeatures?: Record<string, unknown> | null): boolean {
		if (!safetyFeatures) return false;

		const count = Object.values(safetyFeatures).filter((val) => val === true).length;
		return count >= 4;
	}

	/**
	 * Calculate suitable purposes based on amenities
	 */
	private calculateSuitableFor(amenities?: Record<string, unknown> | null): string[] {
		if (!amenities) return [];

		const purposes: string[] = [];

		// Business
		if (amenities.workspace && amenities.wifi) {
			purposes.push(StayPurpose.BUSINESS);
		}

		// Romantic
		if (amenities.coupleRoom || amenities.romanticView || amenities.privateBath) {
			purposes.push(StayPurpose.ROMANTIC);
		}

		// Family
		if (amenities.familyRoom || amenities.kidsFriendly) {
			purposes.push(StayPurpose.FAMILY);
		}

		// Staycation
		if (amenities.pool || amenities.spa || amenities.restaurant) {
			purposes.push(StayPurpose.STAYCATION);
		}

		return purposes;
	}

	/**
	 * Build update payload (filter admin-only fields)
	 */
	private buildUpdatePayload(input: HotelUpdate, isAdmin: boolean): Record<string, unknown> {
		const updateData: Record<string, unknown> = { ...input };
		delete updateData._id;

		// Non-admins cannot change these fields
		if (!isAdmin) {
			delete updateData.hotelStatus;
			delete updateData.badgeLevel;
		}

		return updateData;
	}
}
