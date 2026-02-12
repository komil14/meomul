import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { HotelInput } from '../../libs/dto/hotel/hotel.input';
import { HotelUpdate } from '../../libs/dto/hotel/hotel.update';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import { HotelsDto } from '../../libs/dto/common/hotels';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { HotelSearchInput } from '../../libs/dto/common/search.input';
import { HotelStatus, BadgeLevel } from '../../libs/enums/hotel.enum';
import { MemberType, MemberStatus } from '../../libs/enums/member.enum';
import { StayPurpose } from '../../libs/enums/common.enum';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { HotelDocument } from '../../libs/types/hotel';
import { toHotelDto } from '../../libs/types/hotel';

@Injectable()
export class HotelService {
	constructor(@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>) {}

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
		const safeStayCertified = this.calculateSafeStayCertification(input.safetyFeatures as unknown as Record<string, unknown>);

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
		if (
			String(hotel.memberId) !== String(currentMember._id) &&
			currentMember.memberType !== MemberType.ADMIN
		) {
			throw new ForbiddenException(Messages.NOT_ALLOWED_REQUEST);
		}

		// Build update payload (remove admin-only fields)
		const updateData = this.buildUpdatePayload(input, false);

		// Recalculate safe stay certification if safety features changed
		if (input.safetyFeatures) {
			updateData.safeStayCertified = this.calculateSafeStayCertification(input.safetyFeatures as unknown as Record<string, unknown>);
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

		// Build update payload (allow admin-only fields)
		const updateData = this.buildUpdatePayload(input, true);

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
	 * Get single hotel by ID
	 */
	public async getHotel(hotelId: string): Promise<HotelDto> {
		const hotel = await this.hotelModel.findById(hotelId).exec();
		if (!hotel) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Only show ACTIVE hotels to public (unless admin/owner)
		if (hotel.hotelStatus !== HotelStatus.ACTIVE) {
			throw new NotFoundException(Messages.NO_DATA_FOUND);
		}

		// Increment view count
		await this.hotelModel.findByIdAndUpdate(hotelId, { $inc: { hotelViews: 1 } }).exec();

		return toHotelDto(hotel);
	}

	/**
	 * Get hotels with search and filters
	 */
	public async getHotels(
		input: PaginationInput,
		searchInput?: HotelSearchInput,
	): Promise<HotelsDto> {
		const { page, limit, sort = 'createdAt', direction = Direction.DESC } = input;
		const skip = (page - 1) * limit;

		// Build query
		const query = this.buildSearchQuery(searchInput);

		// Apply purpose-based filters
		if (searchInput?.purpose) {
			this.applyPurposeFilters(query, searchInput.purpose);
		}

		// Execute query
		const [list, total] = await Promise.all([
			this.hotelModel
				.find(query)
				.sort({ [sort]: direction })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.hotelModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toHotelDto),
			metaCounter: { total },
		};
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
				.exec(),
			this.hotelModel.countDocuments(query).exec(),
		]);

		return {
			list: list.map(toHotelDto),
			metaCounter: { total },
		};
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

		// Text search (hotel title or description)
		if (searchInput.text) {
			query.$or = [
				{ hotelTitle: { $regex: searchInput.text, $options: 'i' } },
				{ hotelDesc: { $regex: searchInput.text, $options: 'i' } },
			];
		}

		return query;
	}

	/**
	 * Apply purpose-based filters (BUSINESS, ROMANTIC, FAMILY, etc.)
	 */
	private applyPurposeFilters(query: Record<string, unknown>, purpose: StayPurpose): void {
		switch (purpose) {
			case StayPurpose.BUSINESS:
				// Workspace, WiFi, Meeting room
				query['amenities.workspace'] = true;
				query['amenities.wifi'] = true;
				break;

			case StayPurpose.ROMANTIC:
				// Couple room, romantic view, private bath
				query.$or = [
					{ 'amenities.coupleRoom': true },
					{ 'amenities.romanticView': true },
					{ 'amenities.privateBath': true },
				];
				break;

			case StayPurpose.FAMILY:
				// Family room, kids friendly, playground
				query.$or = [
					{ 'amenities.familyRoom': true },
					{ 'amenities.kidsFriendly': true },
					{ 'amenities.playground': true },
				];
				break;

			case StayPurpose.SOLO:
				// Safe, accessible, 24/7 front desk
				query['safetyFeatures.frontDesk24h'] = true;
				break;

			case StayPurpose.STAYCATION:
				// Pool, spa, room service, restaurant
				query.$or = [
					{ 'amenities.pool': true },
					{ 'amenities.spa': true },
					{ 'amenities.roomService': true },
					{ 'amenities.restaurant': true },
				];
				break;

			default:
				break;
		}
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
