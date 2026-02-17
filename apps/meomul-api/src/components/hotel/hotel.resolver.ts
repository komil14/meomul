import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import { HotelInput } from '../../libs/dto/hotel/hotel.input';
import { HotelUpdate } from '../../libs/dto/hotel/hotel.update';
import { HotelsDto } from '../../libs/dto/common/hotels';
import { PaginationInput } from '../../libs/dto/common/pagination';
import { HotelSearchInput } from '../../libs/dto/common/search.input';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { HotelStatus } from '../../libs/enums/hotel.enum';
import { HotelService } from './hotel.service';

@Resolver()
export class HotelResolver {
	private readonly logger = new Logger(HotelResolver.name);

	constructor(private readonly hotelService: HotelService) {}

	/**
	 * Get all hotels (ADMIN only) — includes PENDING, INACTIVE, SUSPENDED
	 */
	@Query(() => HotelsDto)
	@Roles(MemberType.ADMIN)
	public async getAllHotelsAdmin(
		@Args('input') input: PaginationInput,
		@Args('statusFilter', { type: () => HotelStatus, nullable: true }) statusFilter?: HotelStatus,
	): Promise<HotelsDto> {
		try {
			this.logger.log('Query getAllHotelsAdmin', statusFilter ?? 'all');
			return this.hotelService.getAllHotelsAdmin(input, statusFilter);
		} catch (error) {
			this.logger.error('Query getAllHotelsAdmin failed', error);
			throw error;
		}
	}

	/**
	 * Create a new hotel (AGENT or ADMIN only)
	 */
	@Mutation(() => HotelDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async createHotel(
		@CurrentMember() currentMember: any,
		@Args('input') input: HotelInput,
	): Promise<HotelDto> {
		try {
			this.logger.log('Mutation createHotel', currentMember?._id ?? 'unknown');
			return this.hotelService.createHotel(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation createHotel failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Update hotel by owner
	 */
	@Mutation(() => HotelDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async updateHotel(
		@CurrentMember() currentMember: any,
		@Args('input') input: HotelUpdate,
	): Promise<HotelDto> {
		try {
			this.logger.log('Mutation updateHotel', currentMember?._id ?? 'unknown', input._id);
			return this.hotelService.updateHotel(currentMember, input);
		} catch (error) {
			this.logger.error('Mutation updateHotel failed', currentMember?._id ?? 'unknown', input._id, error);
			throw error;
		}
	}

	/**
	 * Update hotel by admin (full access)
	 */
	@Mutation(() => HotelDto)
	@Roles(MemberType.ADMIN)
	public async updateHotelByAdmin(@Args('input') input: HotelUpdate): Promise<HotelDto> {
		try {
			this.logger.log('Mutation updateHotelByAdmin', input._id);
			return this.hotelService.updateHotelByAdmin(input);
		} catch (error) {
			this.logger.error('Mutation updateHotelByAdmin failed', input._id, error);
			throw error;
		}
	}

	/**
	 * Get single hotel by ID (Public)
	 * Auto-tracks view if user is authenticated
	 */
	@Query(() => HotelDto)
	@Public()
	public async getHotel(
		@Args('hotelId') hotelId: string,
		@CurrentMember() currentMember?: any,
	): Promise<HotelDto> {
		try {
			this.logger.log('Query getHotel', hotelId, currentMember?._id ?? 'anonymous');
			return this.hotelService.getHotel(hotelId, currentMember);
		} catch (error) {
			this.logger.error('Query getHotel failed', hotelId, error);
			throw error;
		}
	}

	/**
	 * Search hotels with filters (Public)
	 */
	@Query(() => HotelsDto)
	@Public()
	public async getHotels(
		@Args('input') input: PaginationInput,
		@Args('search', { nullable: true }) search?: HotelSearchInput,
		@CurrentMember() currentMember?: any,
	): Promise<HotelsDto> {
		try {
			this.logger.log('Query getHotels', input.page, search?.location ?? 'all');
			return this.hotelService.getHotels(input, search, currentMember);
		} catch (error) {
			this.logger.error('Query getHotels failed', input.page, error);
			throw error;
		}
	}

	/**
	 * Get agent's own hotels
	 */
	@Query(() => HotelsDto)
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	public async getAgentHotels(
		@CurrentMember() currentMember: any,
		@Args('input') input: PaginationInput,
	): Promise<HotelsDto> {
		try {
			this.logger.log('Query getAgentHotels', currentMember?._id ?? 'unknown');
			return this.hotelService.getAgentHotels(currentMember, input);
		} catch (error) {
			this.logger.error('Query getAgentHotels failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}
}
