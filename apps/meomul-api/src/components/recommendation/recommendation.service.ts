import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import type { Model, ObjectId as MongooseObjectId } from 'mongoose';
import { Types } from 'mongoose';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import {
	RecommendationExplanationDto,
	RecommendationMetaDto,
	RecommendedHotelsV2Dto,
} from '../../libs/dto/preference/recommended-hotels.dto';
import { RecommendationProfileDto } from '../../libs/dto/preference/recommendation-profile.dto';
import { HotelStatus, HotelLocation } from '../../libs/enums/hotel.enum';
import { ViewGroup, LikeGroup } from '../../libs/enums/common.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import type { HotelDocument } from '../../libs/types/hotel';
import { toHotelDto } from '../../libs/types/hotel';
import type { ViewDocument } from '../../libs/types/view';
import type { BookingDocument } from '../../libs/types/booking';
import type { SearchHistoryDocument } from '../../libs/types/search-history';
import type { UserProfileDocument } from '../../libs/types/user-profile';
import type { RecommendationCacheDocument } from '../../libs/types/recommendation-cache';

interface LikeDocument {
	_id: Types.ObjectId;
	likeGroup: string;
	likeRefId: Types.ObjectId;
	memberId: Types.ObjectId;
	createdAt: Date;
}

interface UserPreferenceProfile {
	preferredLocations: string[];
	preferredTypes: string[];
	preferredPurposes: string[];
	preferredAmenities: string[];
	avgPriceMin?: number;
	avgPriceMax?: number;
	viewedHotelIds: Types.ObjectId[];
	likedHotelIds: Types.ObjectId[];
	bookedHotelIds: Types.ObjectId[];
	profileSource: 'onboarding' | 'computed';
	behaviorMaturity: number;
}

interface RecommendationFacetResult {
	recommended: HotelDto[];
	fallback: HotelDto[];
}

interface RecommendationStageResult {
	hotels: HotelDto[];
	fallbackCount: number;
	matchedLocationCount: number;
}

interface RecommendationResultPayload {
	list: HotelDto[];
	meta: RecommendationMetaDto;
	explanations: RecommendationExplanationDto[];
}

const RECOMMENDATION_CACHE_TTL_MS = 10 * 60 * 1000;
const TRENDING_CACHE_TTL_MS = 15 * 60 * 1000;
const RECOMMENDATION_VERSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_RECOMMENDATION_CACHE_VERSION = '1';
const RECOMMENDATION_ALGO_VERSION = '5';

type RecommendationReasonStage = 'strict' | 'relaxed' | 'general' | 'fallback' | 'trending';
type RecommendationIdInput = string | Types.ObjectId | MongooseObjectId | { toHexString(): string };

@Injectable()
export class RecommendationService {
	private readonly logger = new Logger(RecommendationService.name);

	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('View') private readonly viewModel: Model<ViewDocument>,
		@InjectModel('Like') private readonly likeModel: Model<LikeDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('SearchHistory') private readonly searchHistoryModel: Model<SearchHistoryDocument>,
		@InjectModel('UserProfile') private readonly userProfileModel: Model<UserProfileDocument>,
		@InjectModel('RecommendationCache') private readonly recCacheModel: Model<RecommendationCacheDocument>,
	) {}

	/**
	 * Get personalized hotel recommendations for a logged-in user
	 */
	public async getRecommendedHotels(memberId: string, limit: number = 10): Promise<HotelDto[]> {
		const result = await this.generateRecommendations(memberId, limit);
		return result.list;
	}

	/**
	 * Get personalized hotel recommendations with metadata for frontend transparency.
	 */
	public async getRecommendedHotelsV2(memberId: string, limit: number = 10): Promise<RecommendedHotelsV2Dto> {
		return this.generateRecommendations(memberId, limit);
	}

	private async generateRecommendations(memberId: string, limit: number): Promise<RecommendationResultPayload> {
		const safeLimit = Math.min(Math.max(limit, 1), 30);
		const cacheVersion = await this.getRecommendationCacheVersion(memberId);
		const cacheKey = this.buildRecommendationCacheKey(memberId, cacheVersion, safeLimit);
		const cached = await this.cacheManager.get<RecommendationResultPayload>(cacheKey);
		if (cached) {
			this.logger.debug(`cache hit member=${memberId} limit=${safeLimit} version=${cacheVersion}`);
			return cached;
		}

		const profile = await this.buildUserProfile(memberId);
		const hasActivity = this.hasPreferenceSignals(profile);
		const { onboardingWeight, behaviorWeight } = this.calculateBlendWeights(profile.behaviorMaturity);

		if (!hasActivity) {
			const trending = await this.getTrendingHotels(safeLimit);
			const noProfileResult: RecommendationResultPayload = {
				list: trending,
				meta: {
					profileSource: profile.profileSource,
					onboardingWeight,
					behaviorWeight,
					matchedLocationCount: 0,
					fallbackCount: trending.length,
					strictStageCount: 0,
					relaxedStageCount: 0,
					generalStageCount: trending.length,
				},
				explanations: this.buildTrendingRecommendationExplanations(trending),
			};
			await this.cacheManager.set(cacheKey, noProfileResult, RECOMMENDATION_CACHE_TTL_MS);
			this.logger.debug(`fallback to trending member=${memberId} limit=${safeLimit}`);
			return noProfileResult;
		}

		const strictStageEnabled = profile.preferredLocations.length > 0;
		const strictRatio = strictStageEnabled ? this.clampNumber(onboardingWeight * 0.8, 0.2, 0.68) : 0;
		const relaxedRatio = strictStageEnabled ? this.clampNumber(onboardingWeight * 0.3, 0.12, 0.24) : 0;
		const strictTarget = strictStageEnabled ? Math.max(1, Math.round(safeLimit * strictRatio)) : 0;
		const relaxedTarget =
			strictStageEnabled && strictTarget < safeLimit ? Math.max(0, Math.round(safeLimit * relaxedRatio)) : 0;

		const strictStage = strictStageEnabled
			? await this.runRecommendationStage(profile, strictTarget, {
					onlyPreferredLocations: true,
					enforcePreferredPurposes: true,
					enforcePriceRange: true,
				})
			: this.emptyStageResult();

		const selectedIdsAfterStrict = strictStage.hotels.map((hotel) => this.toObjectId(hotel._id));
		const relaxedStageRoom = Math.max(0, Math.min(relaxedTarget, safeLimit - strictStage.hotels.length));
		const relaxedStage = strictStageEnabled
			? await this.runRecommendationStage(profile, relaxedStageRoom, {
					onlyPreferredLocations: true,
					enforcePreferredPurposes: false,
					enforcePriceRange: false,
					excludeHotelIds: selectedIdsAfterStrict,
				})
			: this.emptyStageResult();

		const selectedIdsForGeneral = [
			...selectedIdsAfterStrict,
			...relaxedStage.hotels.map((hotel) => this.toObjectId(hotel._id)),
		];
		const generalStageRoom = Math.max(0, safeLimit - strictStage.hotels.length - relaxedStage.hotels.length);
		const generalStage = await this.runRecommendationStage(profile, generalStageRoom, {
			excludeHotelIds: selectedIdsForGeneral,
			allowFacetFallback: false,
		});

		const preFallbackList = [...strictStage.hotels, ...relaxedStage.hotels, ...generalStage.hotels];
		const finalExcludedIds = preFallbackList.map((hotel) => this.toObjectId(hotel._id));
		const globalFallbackRoom = Math.max(0, safeLimit - preFallbackList.length);
		const globalFallbackHotels = await this.getTopRatedFallbackHotels(profile, globalFallbackRoom, finalExcludedIds);
		const finalList = [...preFallbackList, ...globalFallbackHotels].slice(0, safeLimit);
		const explanationStageMap = this.buildExplanationStageMap({
			strict: strictStage.hotels,
			relaxed: relaxedStage.hotels,
			general: generalStage.hotels,
			fallback: globalFallbackHotels,
		});
		const matchedLocationCount = finalList.filter((hotel) =>
			profile.preferredLocations.includes(hotel.hotelLocation),
		).length;
		const fallbackCount = globalFallbackHotels.length;

		const result: RecommendationResultPayload = {
			list: finalList,
			meta: {
				profileSource: profile.profileSource,
				onboardingWeight,
				behaviorWeight,
				matchedLocationCount,
				fallbackCount,
				strictStageCount: strictStage.hotels.length,
				relaxedStageCount: relaxedStage.hotels.length,
				generalStageCount: generalStage.hotels.length,
			},
			explanations: this.buildRecommendationExplanations(profile, finalList, explanationStageMap),
		};

		await this.cacheManager.set(cacheKey, result, RECOMMENDATION_CACHE_TTL_MS);
		this.logger.log(
			`generated member=${memberId} limit=${safeLimit} source=${result.meta.profileSource} strict=${result.meta.strictStageCount} relaxed=${result.meta.relaxedStageCount} general=${result.meta.generalStageCount} fallback=${result.meta.fallbackCount} matchedLoc=${result.meta.matchedLocationCount} blend=${result.meta.onboardingWeight}/${result.meta.behaviorWeight}`,
		);
		return result;
	}

	/**
	 * Get current member's recommendation/onboarding profile.
	 */
	public async getMyRecommendationProfile(memberId: string): Promise<RecommendationProfileDto> {
		const profile = await this.userProfileModel
			.findOne({ memberId: new Types.ObjectId(memberId) })
			.lean()
			.exec();

		if (!profile) {
			return {
				hasProfile: false,
				preferredLocations: [],
				preferredTypes: [],
				preferredPurposes: [],
				preferredAmenities: [],
			};
		}

		const preferredLocations = profile.preferredLocations || [];
		const preferredTypes = profile.preferredTypes || [];
		const preferredPurposes = profile.preferredPurposes || [];
		const preferredAmenities = profile.preferredAmenities || [];

		return {
			hasProfile: this.isProfileComplete(profile),
			source: profile.source,
			preferredLocations,
			preferredTypes,
			preferredPurposes,
			preferredAmenities,
			avgPriceMin: profile.avgPriceMin,
			avgPriceMax: profile.avgPriceMax,
			computedAt: profile.computedAt,
		};
	}

	/**
	 * Get trending hotels based on recent activity (last 7 days)
	 */
	public async getTrendingHotels(limit: number = 10, excludeIds: string[] = []): Promise<HotelDto[]> {
		// Only cache when no exclusions (public endpoint)
		const cacheKey = excludeIds.length === 0 ? `trending:${limit}` : null;
		if (cacheKey) {
			const cached = await this.cacheManager.get<HotelDto[]>(cacheKey);
			if (cached) return cached;
		}

		const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
		const excludeObjectIds = excludeIds.map((id) => new Types.ObjectId(id));

		// Single pipeline: $unionWith merges views + likes + bookings,
		// then $group sums weighted scores, then $lookup hotel data
		const trendingPipeline = await this.viewModel.aggregate<HotelDto>([
			// Start with views (weight: 1)
			{
				$match: {
					viewGroup: ViewGroup.HOTEL,
					createdAt: { $gte: sevenDaysAgo },
				},
			},
			{ $project: { hotelId: '$viewRefId', weight: { $literal: 1 } } },

			// Union with likes (weight: 3)
			{
				$unionWith: {
					coll: 'likes',
					pipeline: [
						{
							$match: {
								likeGroup: LikeGroup.HOTEL,
								createdAt: { $gte: sevenDaysAgo },
							},
						},
						{ $project: { hotelId: '$likeRefId', weight: { $literal: 3 } } },
					],
				},
			},

			// Union with bookings (weight: 5)
			{
				$unionWith: {
					coll: 'bookings',
					pipeline: [
						{
							$match: {
								createdAt: { $gte: sevenDaysAgo },
								bookingStatus: {
									$in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
								},
							},
						},
						{ $project: { hotelId: '$hotelId', weight: { $literal: 5 } } },
					],
				},
			},

			// Exclude specific hotel IDs if provided
			...(excludeObjectIds.length > 0 ? [{ $match: { hotelId: { $nin: excludeObjectIds } } }] : []),

			// Group by hotel and sum weighted scores
			{
				$group: {
					_id: '$hotelId',
					trendingScore: { $sum: '$weight' },
				},
			},

			// Sort by score and limit
			{ $sort: { trendingScore: -1 as const } },
			{ $limit: limit },

			// Lookup full hotel document
			{
				$lookup: {
					from: 'hotels',
					localField: '_id',
					foreignField: '_id',
					as: 'hotel',
				},
			},
			{ $unwind: '$hotel' },

			// Only active hotels
			{ $match: { 'hotel.hotelStatus': HotelStatus.ACTIVE } },

			// Promote hotel fields to root level, keep trendingScore for sort
			{ $replaceRoot: { newRoot: { $mergeObjects: ['$hotel', { trendingScore: '$trendingScore' }] } } },
		]);

		let result: HotelDto[];

		if (trendingPipeline.length === 0) {
			// Fallback: highest-rated active hotels
			const hotels = await this.hotelModel
				.find({
					hotelStatus: HotelStatus.ACTIVE,
					_id: { $nin: excludeObjectIds },
				})
				.sort({ hotelRank: -1, hotelRating: -1 })
				.limit(limit)
				.exec();
			result = hotels.map(toHotelDto);
		} else {
			result = trendingPipeline.map((doc) => this.aggregateDocToHotelDto(doc));
		}

		if (cacheKey) await this.cacheManager.set(cacheKey, result, TRENDING_CACHE_TTL_MS);
		return result;
	}

	/**
	 * Get trending hotels for a specific location.
	 * First checks batch-precomputed data, then falls back to filtered global trending.
	 */
	public async getTrendingByLocation(location: HotelLocation, limit: number = 10): Promise<HotelDto[]> {
		const cacheKey = `trending:loc:${location}:${limit}`;
		const cached = await this.cacheManager.get<HotelDto[]>(cacheKey);
		if (cached) return cached;

		// Check batch-precomputed data first
		const precomputed = await this.recCacheModel.findOne({ cacheKey: `trending:${location}` }).exec();
		const precomputedData = Array.isArray(precomputed?.data) ? (precomputed.data as HotelDto[]) : [];

		if (precomputedData.length > 0) {
			const result = precomputedData.slice(0, limit);
			await this.cacheManager.set(cacheKey, result, TRENDING_CACHE_TTL_MS);
			return result;
		}

		// Fallback: filter global trending by location
		const globalTrending = await this.getTrendingHotels(50);
		const locationFiltered = globalTrending.filter((h) => h.hotelLocation === location).slice(0, limit);

		if (locationFiltered.length >= limit) {
			await this.cacheManager.set(cacheKey, locationFiltered, TRENDING_CACHE_TTL_MS);
			return locationFiltered;
		}

		// Not enough trending — pad with top-rated hotels from this location
		const existingIds = locationFiltered.map((h) => h._id as unknown as Types.ObjectId);
		const additional = await this.hotelModel
			.find({
				hotelStatus: HotelStatus.ACTIVE,
				hotelLocation: location,
				_id: { $nin: existingIds },
			})
			.sort({ hotelRank: -1, hotelRating: -1 })
			.limit(limit - locationFiltered.length)
			.exec();

		const result = [...locationFiltered, ...additional.map(toHotelDto)];
		await this.cacheManager.set(cacheKey, result, TRENDING_CACHE_TTL_MS);
		return result;
	}

	/**
	 * Get similar hotels to a given hotel
	 */
	public async getSimilarHotels(hotelId: string, limit: number = 6): Promise<HotelDto[]> {
		const cacheKey = `similar:${hotelId}:${limit}`;
		const cached = await this.cacheManager.get<HotelDto[]>(cacheKey);
		if (cached) return cached;

		const sourceHotel = await this.hotelModel.findById(hotelId).exec();
		if (!sourceHotel) {
			return [];
		}

		const sourceId = new Types.ObjectId(hotelId);

		const hotels = await this.hotelModel.aggregate<HotelDto>([
			{
				$match: {
					_id: { $ne: sourceId },
					hotelStatus: HotelStatus.ACTIVE,
				},
			},
			{
				$addFields: {
					locationMatch: {
						$cond: [{ $eq: ['$hotelLocation', sourceHotel.hotelLocation] }, 30, 0],
					},
					typeMatch: {
						$cond: [{ $eq: ['$hotelType', sourceHotel.hotelType] }, 15, 0],
					},
					purposeOverlap: {
						$multiply: [
							{
								$size: {
									$setIntersection: [{ $ifNull: ['$suitableFor', []] }, sourceHotel.suitableFor || []],
								},
							},
							10,
						],
					},
					ratingBonus: { $multiply: [{ $ifNull: ['$hotelRating', 0] }, 5] },
				},
			},
			{
				$addFields: {
					similarityScore: {
						$add: ['$locationMatch', '$typeMatch', '$purposeOverlap', '$ratingBonus'],
					},
				},
			},
			{ $sort: { similarityScore: -1, hotelRating: -1 } },
			{ $limit: limit },
		]);

		const result = hotels.map((doc) => this.aggregateDocToHotelDto(doc));
		await this.cacheManager.set(cacheKey, result, 1800000); // 30 min
		return result;
	}

	/**
	 * Build user preference profile from search history, views, likes, and bookings
	 */
	/**
	 * Invalidate a user's recommendation cache (called after like/book actions)
	 */
	public async invalidateUserCache(memberId: string): Promise<void> {
		const versionKey = this.getRecommendationVersionKey(memberId);
		const nextVersion = Date.now().toString();
		await Promise.all([
			this.cacheManager.set(versionKey, nextVersion, RECOMMENDATION_VERSION_TTL_MS),
			this.cacheManager.del(`rec:${memberId}:10`), // legacy keys
			this.cacheManager.del(`rec:${memberId}:20`), // legacy keys
		]);
		this.logger.debug(`cache invalidated member=${memberId} version=${nextVersion}`);
	}

	private async buildUserProfile(memberId: string): Promise<UserPreferenceProfile> {
		const memberObjectId = new Types.ObjectId(memberId);
		const existingProfile = await this.userProfileModel.findOne({ memberId: memberObjectId }).lean().exec();

		const freshComputedThreshold = Date.now() - 2 * 3600000;
		const hasFreshComputedAt = Boolean(
			existingProfile?.computedAt && new Date(existingProfile.computedAt).getTime() >= freshComputedThreshold,
		);
		const isFreshComputedProfile = Boolean(
			existingProfile?.source === 'computed' && hasFreshComputedAt && this.isProfileComplete(existingProfile),
		);

		if (existingProfile && isFreshComputedProfile) {
			const behaviorMaturity = this.calculateBehaviorMaturity({
				searchCount: 0,
				viewCount: existingProfile.viewedHotelIds?.length || 0,
				likeCount: existingProfile.likedHotelIds?.length || 0,
				bookingCount: existingProfile.bookedHotelIds?.length || 0,
			});

			return {
				preferredLocations: existingProfile.preferredLocations || [],
				preferredTypes: existingProfile.preferredTypes || [],
				preferredPurposes: existingProfile.preferredPurposes || [],
				preferredAmenities: existingProfile.preferredAmenities || [],
				avgPriceMin: existingProfile.avgPriceMin,
				avgPriceMax: existingProfile.avgPriceMax,
				viewedHotelIds: existingProfile.viewedHotelIds || [],
				likedHotelIds: existingProfile.likedHotelIds || [],
				bookedHotelIds: existingProfile.bookedHotelIds || [],
				profileSource: 'computed',
				behaviorMaturity,
			};
		}

		const onboardingSeed =
			existingProfile && existingProfile.source === 'onboarding' && this.isProfileComplete(existingProfile)
				? existingProfile
				: null;

		// Fallback: compute on the fly
		const now = Date.now();

		const [searchHistory, viewedHotels, likedHotels, bookedHotels] = await Promise.all([
			// Fetch raw search history with timestamps for time-decay
			this.searchHistoryModel
				.find({ memberId: memberObjectId })
				.select('location hotelTypes purpose amenities priceMin priceMax createdAt')
				.sort({ createdAt: -1 })
				.limit(200)
				.exec(),

			// Get viewed hotel IDs
			this.viewModel
				.find({ memberId: memberObjectId, viewGroup: ViewGroup.HOTEL })
				.select('viewRefId')
				.sort({ createdAt: -1 })
				.limit(50)
				.exec(),

			// Get liked hotel IDs
			this.likeModel.find({ memberId: memberObjectId, likeGroup: LikeGroup.HOTEL }).select('likeRefId').exec(),

			// Get booked hotel IDs
			this.bookingModel
				.find({
					guestId: memberObjectId,
					bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
				})
				.select('hotelId')
				.sort({ createdAt: -1 })
				.limit(20)
				.exec(),
		]);

		const signalHotelIds = Array.from(
			new Set(
				[
					...viewedHotels.map((view) => this.toIdString(view.viewRefId)),
					...likedHotels.map((like) => this.toIdString(like.likeRefId)),
					...bookedHotels.map((booking) => this.toIdString(booking.hotelId)),
				].filter(Boolean),
			),
		);
		const signalHotelsById = new Map<string, HotelDocument>();
		if (signalHotelIds.length > 0) {
			const signalHotelDocs = await this.hotelModel
				.find({
					_id: { $in: signalHotelIds.map((id) => this.toObjectId(id)) },
					hotelStatus: HotelStatus.ACTIVE,
				})
				.select('hotelLocation hotelType suitableFor')
				.exec();

			for (const hotel of signalHotelDocs) {
				signalHotelsById.set(this.toIdString(hotel._id), hotel);
			}
		}

		// Time-decay weighted extraction: recent searches weigh more
		const weightedLocations: string[] = [];
		const weightedTypes: string[] = [];
		const weightedPurposes: string[] = [];
		const weightedAmenities: string[] = [];
		let totalPriceWeight = 0;
		let weightedPriceMin = 0;
		let weightedPriceMax = 0;

		if (onboardingSeed) {
			for (const location of onboardingSeed.preferredLocations || []) {
				for (let i = 0; i < 5; i += 1) weightedLocations.push(location);
			}
			for (const hotelType of onboardingSeed.preferredTypes || []) {
				for (let i = 0; i < 4; i += 1) weightedTypes.push(hotelType);
			}
			for (const purpose of onboardingSeed.preferredPurposes || []) {
				for (let i = 0; i < 5; i += 1) weightedPurposes.push(purpose);
			}
			for (const amenity of onboardingSeed.preferredAmenities || []) {
				for (let i = 0; i < 3; i += 1) weightedAmenities.push(amenity);
			}
		}

		for (const search of searchHistory) {
			const ageMs = now - new Date(search.createdAt).getTime();
			const weight = this.getTimeDecayWeight(ageMs);
			const repeatCount = Math.max(1, Math.round(weight * 5)); // 1-5 entries

			if (search.location) {
				for (let i = 0; i < repeatCount; i++) weightedLocations.push(search.location);
			}
			for (const t of search.hotelTypes || []) {
				for (let i = 0; i < repeatCount; i++) weightedTypes.push(t);
			}
			if (search.purpose) {
				for (let i = 0; i < repeatCount; i++) weightedPurposes.push(search.purpose);
			}
			for (const a of search.amenities || []) {
				for (let i = 0; i < repeatCount; i++) weightedAmenities.push(a);
			}
			if (search.priceMin != null || search.priceMax != null) {
				weightedPriceMin += (search.priceMin || 0) * weight;
				weightedPriceMax += (search.priceMax || 0) * weight;
				totalPriceWeight += weight;
			}
		}

		for (const view of viewedHotels) {
			this.appendHotelPreferenceSignals(
				weightedLocations,
				weightedTypes,
				weightedPurposes,
				signalHotelsById.get(this.toIdString(view.viewRefId)),
				2,
			);
		}

		for (const like of likedHotels) {
			this.appendHotelPreferenceSignals(
				weightedLocations,
				weightedTypes,
				weightedPurposes,
				signalHotelsById.get(this.toIdString(like.likeRefId)),
				4,
			);
		}

		for (const booking of bookedHotels) {
			this.appendHotelPreferenceSignals(
				weightedLocations,
				weightedTypes,
				weightedPurposes,
				signalHotelsById.get(this.toIdString(booking.hotelId)),
				6,
			);
		}

		const preferredLocations = this.getTopFrequent(weightedLocations.filter(Boolean), 3);
		const preferredTypes = this.getTopFrequent(weightedTypes.filter(Boolean), 3);
		const preferredPurposes = this.getTopFrequent(weightedPurposes.filter(Boolean), 3);
		const preferredAmenities = this.getTopFrequent(weightedAmenities.filter(Boolean), 5);
		const hasBehaviorSignals =
			searchHistory.length > 0 || viewedHotels.length > 0 || likedHotels.length > 0 || bookedHotels.length > 0;
		const behaviorMaturity = this.calculateBehaviorMaturity({
			searchCount: searchHistory.length,
			viewCount: viewedHotels.length,
			likeCount: likedHotels.length,
			bookingCount: bookedHotels.length,
		});

		return {
			preferredLocations: preferredLocations.slice(0, 5),
			preferredTypes: preferredTypes.slice(0, 4),
			preferredPurposes: preferredPurposes.slice(0, 4),
			preferredAmenities: preferredAmenities.slice(0, 8),
			avgPriceMin: totalPriceWeight > 0 ? weightedPriceMin / totalPriceWeight : onboardingSeed?.avgPriceMin,
			avgPriceMax: totalPriceWeight > 0 ? weightedPriceMax / totalPriceWeight : onboardingSeed?.avgPriceMax,
			viewedHotelIds: viewedHotels.map((v) => v.viewRefId),
			likedHotelIds: likedHotels.map((l) => l.likeRefId),
			bookedHotelIds: bookedHotels.map((b) => b.hotelId),
			profileSource: onboardingSeed && !hasBehaviorSignals ? 'onboarding' : 'computed',
			behaviorMaturity,
		};
	}

	/**
	 * Time-decay weight: recent activity weighs more
	 * <24h=1.0, <3d=0.8, <7d=0.5, <30d=0.2, older=0.05
	 */
	/**
	 * Seasonal boosts: locations and hotel types that are popular in the current season
	 */
	private getSeasonalBoosts(): { locations: string[]; types: string[] } {
		const month = new Date().getMonth(); // 0-11

		if (month >= 5 && month <= 7) {
			// Summer (Jun-Aug): beach, resort destinations
			return {
				locations: [HotelLocation.JEJU, HotelLocation.BUSAN, HotelLocation.GANGNEUNG],
				types: ['RESORT', 'BEACH'],
			};
		}
		if (month >= 11 || month <= 1) {
			// Winter (Dec-Feb): ski, traditional stays
			return {
				locations: [HotelLocation.GANGNEUNG, HotelLocation.GYEONGJU],
				types: ['SKI', 'TRADITIONAL'],
			};
		}
		if (month >= 2 && month <= 4) {
			// Spring (Mar-May): cherry blossoms, boutique
			return {
				locations: [HotelLocation.GYEONGJU, HotelLocation.JEJU],
				types: ['BOUTIQUE', 'TRADITIONAL'],
			};
		}
		// Autumn (Sep-Nov): foliage, cultural
		return {
			locations: [HotelLocation.GYEONGJU, HotelLocation.SEOUL],
			types: ['BOUTIQUE', 'CULTURAL'],
		};
	}

	private getTimeDecayWeight(ageMs: number): number {
		const hours = ageMs / 3600000;
		if (hours < 24) return 1.0;
		if (hours < 72) return 0.8;
		if (hours < 168) return 0.5;
		if (hours < 720) return 0.2;
		return 0.05;
	}

	private calculateBehaviorMaturity(signalCounts: {
		searchCount: number;
		viewCount: number;
		likeCount: number;
		bookingCount: number;
	}): number {
		const searchSignal = this.clampNumber(signalCounts.searchCount / 12, 0, 1) * 0.35;
		const viewSignal = this.clampNumber(signalCounts.viewCount / 20, 0, 1) * 0.25;
		const likeSignal = this.clampNumber(signalCounts.likeCount / 8, 0, 1) * 0.2;
		const bookingSignal = this.clampNumber(signalCounts.bookingCount / 4, 0, 1) * 0.2;
		const total = searchSignal + viewSignal + likeSignal + bookingSignal;

		return this.round2(this.clampNumber(total, 0, 1));
	}

	private calculateBlendWeights(behaviorMaturity: number): { onboardingWeight: number; behaviorWeight: number } {
		const maturity = this.clampNumber(behaviorMaturity, 0, 1);
		const onboardingWeight = this.round2(this.clampNumber(0.85 - maturity * 0.6, 0.25, 0.85));
		const behaviorWeight = this.round2(1 - onboardingWeight);

		return {
			onboardingWeight,
			behaviorWeight,
		};
	}

	private hasPreferenceSignals(profile: UserPreferenceProfile): boolean {
		return (
			profile.preferredLocations.length > 0 ||
			profile.preferredTypes.length > 0 ||
			profile.preferredPurposes.length > 0 ||
			profile.preferredAmenities.length > 0 ||
			profile.avgPriceMin !== undefined ||
			profile.avgPriceMax !== undefined ||
			profile.likedHotelIds.length > 0 ||
			profile.bookedHotelIds.length > 0 ||
			profile.viewedHotelIds.length > 0
		);
	}

	private buildTrendingRecommendationExplanations(hotels: HotelDto[]): RecommendationExplanationDto[] {
		return hotels.map((hotel) => ({
			hotelId: this.toIdString(hotel._id),
			stage: 'trending',
			fromFallback: true,
			matchedLocation: false,
			matchedType: false,
			matchedPrice: false,
			likedSimilar: false,
			matchedPurposes: [],
			matchedAmenities: [],
			signals: this.buildTrendingSignals(hotel),
		}));
	}

	private buildTrendingSignals(hotel: HotelDto): string[] {
		const locationLabel = this.toTitleCaseLabel(String(hotel.hotelLocation));
		const typeLabel = this.toTitleCaseLabel(String(hotel.hotelType));
		const safeRating = Number.isFinite(hotel.hotelRating) ? Number(hotel.hotelRating) : 0;
		const safeLikes = Number.isFinite(hotel.hotelLikes) ? Number(hotel.hotelLikes) : 0;
		const signals: string[] = [];

		if (locationLabel) {
			signals.push(`Trending this week in ${locationLabel}`);
		}

		if (typeLabel) {
			signals.push(`High-demand ${typeLabel.toLowerCase()} pick`);
		}

		if (safeRating > 0) {
			signals.push(`Strong guest rating: ★ ${safeRating.toFixed(1)}`);
		}

		if (safeLikes > 0) {
			signals.push(`${safeLikes.toLocaleString()} recent guest likes`);
		}

		if (signals.length === 0) {
			signals.push('Popular with guests right now');
			signals.push('Strong overall activity and engagement');
		}

		return signals.slice(0, 4);
	}

	private toTitleCaseLabel(value: string): string {
		const normalized = value.trim().replace(/_/g, ' ').toLowerCase();
		if (!normalized) {
			return '';
		}

		return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	private buildExplanationStageMap(stageGroups: {
		strict: HotelDto[];
		relaxed: HotelDto[];
		general: HotelDto[];
		fallback: HotelDto[];
	}): Map<string, RecommendationReasonStage> {
		const stageMap = new Map<string, RecommendationReasonStage>();
		for (const hotel of stageGroups.strict) {
			stageMap.set(this.toIdString(hotel._id), 'strict');
		}
		for (const hotel of stageGroups.relaxed) {
			stageMap.set(this.toIdString(hotel._id), 'relaxed');
		}
		for (const hotel of stageGroups.general) {
			stageMap.set(this.toIdString(hotel._id), 'general');
		}
		for (const hotel of stageGroups.fallback) {
			stageMap.set(this.toIdString(hotel._id), 'fallback');
		}

		return stageMap;
	}

	private buildRecommendationExplanations(
		profile: UserPreferenceProfile,
		hotels: HotelDto[],
		stageMap: Map<string, RecommendationReasonStage>,
	): RecommendationExplanationDto[] {
		return hotels.map((hotel) => this.buildRecommendationExplanation(profile, hotel, stageMap));
	}

	private buildRecommendationExplanation(
		profile: UserPreferenceProfile,
		hotel: HotelDto,
		stageMap: Map<string, RecommendationReasonStage>,
	): RecommendationExplanationDto {
		const hotelId = this.toIdString(hotel._id);
		const stage = stageMap.get(hotelId) ?? 'general';
		const matchedLocation = profile.preferredLocations.includes(hotel.hotelLocation);
		const matchedType = profile.preferredTypes.includes(hotel.hotelType);
		const matchedPurposes = (hotel.suitableFor || []).filter((purpose) => profile.preferredPurposes.includes(purpose));
		const matchedAmenities = profile.preferredAmenities.filter((amenity) => this.hasHotelAmenity(hotel, amenity));
		const matchedPrice = stage === 'strict' && profile.avgPriceMax !== undefined;
		const likedSimilar =
			profile.likedHotelIds.length > 0 &&
			(matchedLocation || matchedType || matchedPurposes.length > 0 || matchedAmenities.length > 0);
		const signals = this.buildRecommendationSignals({
			stage,
			matchedLocation,
			matchedType,
			matchedPurposes,
			matchedAmenities,
			matchedPrice,
			likedSimilar,
		});

		return {
			hotelId,
			stage,
			fromFallback: stage === 'fallback',
			matchedLocation,
			matchedType,
			matchedPrice,
			likedSimilar,
			matchedPurposes,
			matchedAmenities,
			signals,
		};
	}

	private buildRecommendationSignals(input: {
		stage: RecommendationReasonStage;
		matchedLocation: boolean;
		matchedType: boolean;
		matchedPurposes: string[];
		matchedAmenities: string[];
		matchedPrice: boolean;
		likedSimilar: boolean;
	}): string[] {
		const signals: string[] = [];

		switch (input.stage) {
			case 'strict':
				signals.push('Strong match for your saved travel preferences');
				break;
			case 'relaxed':
				signals.push('Good match based on your core preferences');
				break;
			case 'general':
				signals.push('Balanced pick based on your recent browsing behavior');
				break;
			case 'fallback':
				signals.push('High-quality fallback aligned with your general taste');
				break;
			default:
				break;
		}

		if (input.matchedLocation) {
			signals.push('Matches your preferred location');
		}
		if (input.matchedType) {
			signals.push('Matches your preferred hotel type');
		}
		if (input.matchedPurposes.length > 0) {
			signals.push(`Fits your trip purpose: ${input.matchedPurposes.slice(0, 2).join(', ')}`);
		}
		if (input.matchedAmenities.length > 0) {
			signals.push(`Includes amenities you often choose: ${input.matchedAmenities.slice(0, 2).join(', ')}`);
		}
		if (input.matchedPrice) {
			signals.push('Stays within your usual budget range');
		}
		if (input.likedSimilar) {
			signals.push('Similar to hotels you previously liked');
		}

		if (signals.length === 0) {
			signals.push('Recommended from your overall profile and platform quality signals');
		}

		return signals.slice(0, 4);
	}

	private hasHexStringMethod(value: unknown): value is { toHexString(): string } {
		return (
			typeof value === 'object' &&
			value !== null &&
			typeof (value as { toHexString?: unknown }).toHexString === 'function'
		);
	}

	private toIdString(value: RecommendationIdInput): string {
		if (typeof value === 'string') {
			return value;
		}

		if (this.hasHexStringMethod(value)) {
			return value.toHexString();
		}

		throw new TypeError('Unsupported recommendation id value');
	}

	private toObjectId(value: RecommendationIdInput): Types.ObjectId {
		if (value instanceof Types.ObjectId) {
			return value;
		}

		if (typeof value === 'string') {
			return new Types.ObjectId(value);
		}

		if (this.hasHexStringMethod(value)) {
			return new Types.ObjectId(value.toHexString());
		}

		throw new TypeError('Unsupported recommendation id value');
	}

	private appendHotelPreferenceSignals(
		weightedLocations: string[],
		weightedTypes: string[],
		weightedPurposes: string[],
		hotel: HotelDocument | undefined,
		repeatCount: number,
	): void {
		if (!hotel || repeatCount <= 0) {
			return;
		}

		if (hotel.hotelLocation) {
			for (let i = 0; i < repeatCount; i += 1) weightedLocations.push(hotel.hotelLocation);
		}
		if (hotel.hotelType) {
			for (let i = 0; i < repeatCount; i += 1) weightedTypes.push(hotel.hotelType);
		}
		for (const purpose of hotel.suitableFor || []) {
			for (let i = 0; i < repeatCount; i += 1) weightedPurposes.push(purpose);
		}
	}

	private hasHotelAmenity(hotel: HotelDto, amenity: string): boolean {
		const amenityMap = hotel.amenities as unknown as Record<string, unknown> | undefined;
		if (!amenityMap) {
			return false;
		}

		return amenityMap[amenity] === true;
	}

	private clampNumber(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	private round2(value: number): number {
		return Number(value.toFixed(2));
	}

	/**
	 * Build the MongoDB aggregation pipeline for personalized recommendations
	 */
	private buildRecommendationPipeline(
		profile: UserPreferenceProfile,
		limit: number,
		options?: {
			onlyPreferredLocations?: boolean;
			enforcePreferredPurposes?: boolean;
			enforcePriceRange?: boolean;
			excludeHotelIds?: Types.ObjectId[];
		},
	): any[] {
		const pipeline: any[] = [];

		// Stage 1: Only ACTIVE hotels
		pipeline.push({
			$match: {
				hotelStatus: HotelStatus.ACTIVE,
			},
		});

		// Stage 2: Exclude already-booked hotels and stage-specific exclusions
		const excludedIdsByStage = options?.excludeHotelIds || [];
		const excludedHotelIds = [...profile.bookedHotelIds, ...excludedIdsByStage];
		if (excludedHotelIds.length > 0) {
			pipeline.push({
				$match: {
					_id: { $nin: excludedHotelIds },
				},
			});
		}

		if (options?.onlyPreferredLocations && profile.preferredLocations.length > 0) {
			pipeline.push({
				$match: {
					hotelLocation: { $in: profile.preferredLocations },
				},
			});
		}

		if (options?.enforcePreferredPurposes && profile.preferredPurposes.length > 0) {
			pipeline.push({
				$match: {
					suitableFor: { $in: profile.preferredPurposes },
				},
			});
		}

		// Stage 3: Lookup minimum room price per hotel
		pipeline.push(
			{
				$lookup: {
					from: 'rooms',
					let: { hotelId: '$_id' },
					pipeline: [
						{ $match: { $expr: { $eq: ['$hotelId', '$$hotelId'] }, roomStatus: 'AVAILABLE' } },
						{ $group: { _id: null, minPrice: { $min: '$basePrice' } } },
					],
					as: 'roomPricing',
				},
			},
			{
				$addFields: {
					startingPrice: { $ifNull: [{ $arrayElemAt: ['$roomPricing.minPrice', 0] }, 0] },
				},
			},
		);

		if (options?.enforcePriceRange && profile.avgPriceMax) {
			pipeline.push({
				$match: {
					startingPrice: {
						$gte: profile.avgPriceMin || 0,
						$lte: profile.avgPriceMax,
					},
				},
			});
		}

		// Stage 4: Calculate scores (including seasonal awareness)
		const amenityScoreFields: any[] = profile.preferredAmenities.map((amenity) => ({
			$cond: [{ $eq: [`$amenities.${amenity}`, true] }, 2, 0],
		}));

		const seasonal = this.getSeasonalBoosts();

		pipeline.push({
			$addFields: {
				seasonalScore: {
					$add: [
						seasonal.locations.length > 0 ? { $cond: [{ $in: ['$hotelLocation', seasonal.locations] }, 10, 0] } : 0,
						seasonal.types.length > 0 ? { $cond: [{ $in: ['$hotelType', seasonal.types] }, 5, 0] } : 0,
					],
				},
				locationScore: {
					$cond: [{ $in: ['$hotelLocation', profile.preferredLocations] }, 30, 0],
				},
				typeScore: {
					$cond: [{ $in: ['$hotelType', profile.preferredTypes] }, 15, 0],
				},
				purposeScore: {
					$multiply: [
						{
							$size: {
								$setIntersection: [{ $ifNull: ['$suitableFor', []] }, profile.preferredPurposes],
							},
						},
						10,
					],
				},
				amenityScore: amenityScoreFields.length > 0 ? { $add: amenityScoreFields } : 0,
				ratingScore: {
					$multiply: [{ $ifNull: ['$hotelRating', 0] }, 5],
				},
				popularityScore: {
					$min: [
						{
							$add: [{ $ifNull: ['$hotelViews', 0] }, { $multiply: [{ $ifNull: ['$hotelLikes', 0] }, 3] }],
						},
						10,
					],
				},
				likedBonus: {
					$cond: [{ $in: ['$_id', profile.likedHotelIds] }, 20, 0],
				},
				recencyBonus: {
					$cond: [
						{
							$gte: ['$updatedAt', new Date(Date.now() - 14 * 86400000)],
						},
						5,
						0,
					],
				},
				priceScore: profile.avgPriceMax
					? {
							$cond: [
								{
									$and: [
										{ $gte: ['$startingPrice', profile.avgPriceMin || 0] },
										{ $lte: ['$startingPrice', profile.avgPriceMax] },
									],
								},
								15,
								0,
							],
						}
					: 0,
			},
		});

		// Stage 5: Total score
		pipeline.push({
			$addFields: {
				recommendationScore: {
					$add: [
						'$locationScore',
						'$typeScore',
						'$purposeScore',
						'$amenityScore',
						'$ratingScore',
						'$popularityScore',
						'$likedBonus',
						'$recencyBonus',
						'$priceScore',
						'$seasonalScore',
					],
				},
			},
		});

		// Stage 6: $facet — scored recommendations + fallback in one query
		pipeline.push({
			$facet: {
				// Primary: personalized scored results
				recommended: [{ $sort: { recommendationScore: -1, hotelRating: -1 } }, { $limit: limit }],
				// Fallback: still profile-aware, then rank/rating/popularity.
				fallback: [
					{
						$sort: {
							locationScore: -1,
							typeScore: -1,
							purposeScore: -1,
							amenityScore: -1,
							priceScore: -1,
							hotelRank: -1,
							hotelRating: -1,
							hotelLikes: -1,
							hotelReviews: -1,
							updatedAt: -1,
						},
					},
					{ $limit: limit },
				],
			},
		});

		return pipeline;
	}

	private emptyStageResult(): RecommendationStageResult {
		return {
			hotels: [],
			fallbackCount: 0,
			matchedLocationCount: 0,
		};
	}

	private async runRecommendationStage(
		profile: UserPreferenceProfile,
		limit: number,
		options?: {
			onlyPreferredLocations?: boolean;
			enforcePreferredPurposes?: boolean;
			enforcePriceRange?: boolean;
			excludeHotelIds?: Types.ObjectId[];
			allowFacetFallback?: boolean;
		},
	): Promise<RecommendationStageResult> {
		if (limit <= 0) {
			return this.emptyStageResult();
		}

		const pipeline = this.buildRecommendationPipeline(profile, limit, options);
		const [facetResult] = await this.hotelModel.aggregate<RecommendationFacetResult>(pipeline).exec();
		const scored = facetResult?.recommended ?? [];
		const fallback = facetResult?.fallback ?? [];
		const allowFacetFallback = options?.allowFacetFallback !== false;
		const combined = allowFacetFallback ? this.combineFacetResults(scored, fallback, limit) : scored.slice(0, limit);
		const fallbackCount = Math.max(0, combined.length - scored.length);
		const hotels = combined.map((doc) => this.aggregateDocToHotelDto(doc));
		const matchedLocationCount = hotels.filter((hotel) =>
			profile.preferredLocations.includes(hotel.hotelLocation),
		).length;

		return {
			hotels,
			fallbackCount,
			matchedLocationCount,
		};
	}

	private async getTopRatedFallbackHotels(
		profile: UserPreferenceProfile,
		limit: number,
		excludeHotelIds: Types.ObjectId[],
	): Promise<HotelDto[]> {
		if (limit <= 0) {
			return [];
		}

		const pipeline: any[] = [
			{
				$match: {
					hotelStatus: HotelStatus.ACTIVE,
					_id: { $nin: excludeHotelIds },
				},
			},
			{
				$addFields: {
					fallbackLocationScore: {
						$cond: [{ $in: ['$hotelLocation', profile.preferredLocations] }, 1, 0],
					},
					fallbackTypeScore: {
						$cond: [{ $in: ['$hotelType', profile.preferredTypes] }, 1, 0],
					},
					fallbackPurposeScore: {
						$size: {
							$setIntersection: [{ $ifNull: ['$suitableFor', []] }, profile.preferredPurposes],
						},
					},
				},
			},
			{
				$sort: {
					fallbackLocationScore: -1,
					fallbackTypeScore: -1,
					fallbackPurposeScore: -1,
					hotelRank: -1,
					hotelRating: -1,
					hotelLikes: -1,
					hotelReviews: -1,
					updatedAt: -1,
				},
			},
			{ $limit: limit },
		];

		const docs = await this.hotelModel.aggregate<HotelDto>(pipeline).exec();
		return docs.map((doc) => this.aggregateDocToHotelDto(doc));
	}

	private combineFacetResults(scored: HotelDto[], fallback: HotelDto[], limit: number): HotelDto[] {
		const usedIds = new Set(scored.map((hotel) => this.toIdString(hotel._id)));
		const padding = fallback
			.filter((hotel) => !usedIds.has(this.toIdString(hotel._id)))
			.slice(0, Math.max(0, limit - scored.length));
		return [...scored, ...padding];
	}

	/**
	 * Get top N most frequent items from an array
	 */
	private getTopFrequent(items: string[], topN: number): string[] {
		const freq = new Map<string, number>();
		for (const item of items) {
			freq.set(item, (freq.get(item) || 0) + 1);
		}
		return Array.from(freq.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, topN)
			.map(([item]) => item);
	}

	private getRecommendationVersionKey(memberId: string): string {
		return `rec:v:${memberId}`;
	}

	private buildRecommendationCacheKey(memberId: string, cacheVersion: string, limit: number): string {
		return `rec:${memberId}:${cacheVersion}:algo-${RECOMMENDATION_ALGO_VERSION}:${limit}`;
	}

	private async getRecommendationCacheVersion(memberId: string): Promise<string> {
		const key = this.getRecommendationVersionKey(memberId);
		const cached = await this.cacheManager.get<string>(key);
		if (cached) {
			return cached;
		}

		await this.cacheManager.set(key, DEFAULT_RECOMMENDATION_CACHE_VERSION, RECOMMENDATION_VERSION_TTL_MS);
		return DEFAULT_RECOMMENDATION_CACHE_VERSION;
	}

	/**
	 * Convert aggregation result document to HotelDto
	 */
	private aggregateDocToHotelDto(doc: HotelDto): HotelDto {
		return {
			_id: doc._id,
			memberId: doc.memberId,
			hotelType: doc.hotelType,
			hotelTitle: doc.hotelTitle,
			hotelDesc: doc.hotelDesc ?? '',
			hotelLocation: doc.hotelLocation,
			detailedLocation: doc.detailedLocation,
			starRating: doc.starRating,
			checkInTime: doc.checkInTime,
			checkOutTime: doc.checkOutTime,
			flexibleCheckIn: doc.flexibleCheckIn,
			flexibleCheckOut: doc.flexibleCheckOut,
			verificationStatus: doc.verificationStatus,
			badgeLevel: doc.badgeLevel,
			verificationDocs: doc.verificationDocs,
			lastInspectionDate: doc.lastInspectionDate,
			cancellationPolicy: doc.cancellationPolicy,
			ageRestriction: doc.ageRestriction,
			petsAllowed: doc.petsAllowed,
			maxPetWeight: doc.maxPetWeight,
			smokingAllowed: doc.smokingAllowed,
			amenities: doc.amenities,
			safetyFeatures: doc.safetyFeatures,
			safeStayCertified: doc.safeStayCertified,
			suitableFor: doc.suitableFor ?? [],
			hotelImages: doc.hotelImages ?? [],
			hotelVideos: doc.hotelVideos ?? [],
			hotelViews: doc.hotelViews ?? 0,
			hotelLikes: doc.hotelLikes ?? 0,
			hotelReviews: doc.hotelReviews ?? 0,
			hotelRating: doc.hotelRating ?? 0,
			hotelRank: doc.hotelRank ?? 0,
			warningStrikes: doc.warningStrikes ?? 0,
			strikeHistory: (doc.strikeHistory || []).map((s) => ({
				bookingId: String(s.bookingId),
				reason: s.reason,
				date: s.date,
			})),
			hotelStatus: doc.hotelStatus,
			createdAt: doc.createdAt,
			updatedAt: doc.updatedAt,
			deletedAt: doc.deletedAt,
		};
	}

	private isProfileComplete(
		profile:
			| {
					preferredLocations?: string[];
					preferredPurposes?: string[];
			  }
			| null
			| undefined,
	): boolean {
		if (!profile) {
			return false;
		}

		return (profile.preferredLocations?.length ?? 0) > 0 && (profile.preferredPurposes?.length ?? 0) > 0;
	}
}
