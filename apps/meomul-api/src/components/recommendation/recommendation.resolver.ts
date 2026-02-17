import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Logger } from '@nestjs/common';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enum';
import { HotelLocation } from '../../libs/enums/hotel.enum';
import { RecommendationService } from './recommendation.service';

@Resolver()
export class RecommendationResolver {
	private readonly logger = new Logger(RecommendationResolver.name);

	constructor(private readonly recommendationService: RecommendationService) {}

	/**
	 * Get personalized hotel recommendations (requires auth)
	 */
	@Query(() => [HotelDto])
	@Roles(MemberType.USER, MemberType.AGENT, MemberType.ADMIN)
	public async getRecommendedHotels(
		@CurrentMember() currentMember: any,
		@Args('limit', { type: () => Int, nullable: true, defaultValue: 10 }) limit: number,
	): Promise<HotelDto[]> {
		try {
			this.logger.log('Query getRecommendedHotels', currentMember?._id ?? 'unknown');
			return this.recommendationService.getRecommendedHotels(currentMember._id, limit);
		} catch (error) {
			this.logger.error('Query getRecommendedHotels failed', currentMember?._id ?? 'unknown', error);
			throw error;
		}
	}

	/**
	 * Get trending hotels (public, no auth needed)
	 */
	@Query(() => [HotelDto])
	@Public()
	public async getTrendingHotels(
		@Args('limit', { type: () => Int, nullable: true, defaultValue: 10 }) limit: number,
	): Promise<HotelDto[]> {
		try {
			this.logger.log('Query getTrendingHotels');
			return this.recommendationService.getTrendingHotels(limit);
		} catch (error) {
			this.logger.error('Query getTrendingHotels failed', error);
			throw error;
		}
	}

	/**
	 * Get trending hotels for a specific location (public)
	 */
	@Query(() => [HotelDto])
	@Public()
	public async getTrendingByLocation(
		@Args('location', { type: () => HotelLocation }) location: HotelLocation,
		@Args('limit', { type: () => Int, nullable: true, defaultValue: 10 }) limit: number,
	): Promise<HotelDto[]> {
		try {
			this.logger.log('Query getTrendingByLocation', location);
			return this.recommendationService.getTrendingByLocation(location, limit);
		} catch (error) {
			this.logger.error('Query getTrendingByLocation failed', location, error);
			throw error;
		}
	}

	/**
	 * Get similar hotels to a given hotel (public)
	 */
	@Query(() => [HotelDto])
	@Public()
	public async getSimilarHotels(
		@Args('hotelId') hotelId: string,
		@Args('limit', { type: () => Int, nullable: true, defaultValue: 6 }) limit: number,
	): Promise<HotelDto[]> {
		try {
			this.logger.log('Query getSimilarHotels', hotelId);
			return this.recommendationService.getSimilarHotels(hotelId, limit);
		} catch (error) {
			this.logger.error('Query getSimilarHotels failed', hotelId, error);
			throw error;
		}
	}
}
