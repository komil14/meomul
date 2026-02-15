import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import type { Cache } from 'cache-manager';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { HotelDto } from '../../libs/dto/hotel/hotel';
import { HotelStatus, HotelLocation } from '../../libs/enums/hotel.enum';
import { ViewGroup, LikeGroup } from '../../libs/enums/common.enum';
import { BookingStatus } from '../../libs/enums/booking.enum';
import type { HotelDocument } from '../../libs/types/hotel';
import { toHotelDto } from '../../libs/types/hotel';
import type { ViewDocument } from '../../libs/types/view';
import type { BookingDocument } from '../../libs/types/booking';
import type { SearchHistoryDocument } from '../../libs/types/search-history';

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
}

@Injectable()
export class RecommendationService {
	constructor(
		@Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('View') private readonly viewModel: Model<ViewDocument>,
		@InjectModel('Like') private readonly likeModel: Model<LikeDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('SearchHistory') private readonly searchHistoryModel: Model<SearchHistoryDocument>,
		@InjectModel('RecommendationCache') private readonly recCacheModel: Model<any>,
	) {}

	/**
	 * Get personalized hotel recommendations for a logged-in user
	 */
	public async getRecommendedHotels(memberId: string, limit: number = 10): Promise<HotelDto[]> {
		const cacheKey = `rec:${memberId}:${limit}`;
		const cached = await this.cacheManager.get<HotelDto[]>(cacheKey);
		if (cached) return cached;

		const profile = await this.buildUserProfile(memberId);

		// If user has no activity, fall back to trending
		const hasActivity =
			profile.preferredLocations.length > 0 ||
			profile.likedHotelIds.length > 0 ||
			profile.bookedHotelIds.length > 0;

		if (!hasActivity) {
			return this.getTrendingHotels(limit);
		}

		// Single query with $facet: scored recommendations + fallback in one DB call
		const pipeline = this.buildRecommendationPipeline(profile, limit);
		const [facetResult] = await this.hotelModel.aggregate(pipeline).exec();

		const scored: any[] = facetResult?.recommended ?? [];
		const fallback: any[] = facetResult?.fallback ?? [];

		// Use scored results, pad with fallback if not enough
		const usedIds = new Set(scored.map((r: any) => String(r._id)));
		const padding = fallback
			.filter((r: any) => !usedIds.has(String(r._id)))
			.slice(0, limit - scored.length);

		const finalResults = [...scored, ...padding].map((doc: any) => this.aggregateDocToHotelDto(doc));

		await this.cacheManager.set(cacheKey, finalResults, 600000); // 10 min
		return finalResults;
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
		const trendingPipeline = await this.viewModel.aggregate([
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
			...(excludeObjectIds.length > 0
				? [{ $match: { hotelId: { $nin: excludeObjectIds } } }]
				: []),

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
			result = trendingPipeline.map((doc: any) => this.aggregateDocToHotelDto(doc));
		}

		if (cacheKey) await this.cacheManager.set(cacheKey, result, 900000); // 15 min
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
		const precomputed = await this.recCacheModel
			.findOne({ cacheKey: `trending:${location}` })
			.exec();

		if (precomputed && precomputed.data?.length > 0) {
			const result = (precomputed.data as HotelDto[]).slice(0, limit);
			await this.cacheManager.set(cacheKey, result, 900000); // 15 min
			return result;
		}

		// Fallback: filter global trending by location
		const globalTrending = await this.getTrendingHotels(50);
		const locationFiltered = globalTrending
			.filter((h) => h.hotelLocation === location)
			.slice(0, limit);

		if (locationFiltered.length >= limit) {
			await this.cacheManager.set(cacheKey, locationFiltered, 900000);
			return locationFiltered;
		}

		// Not enough trending — pad with top-rated hotels from this location
		const existingIds = locationFiltered.map((h) => new Types.ObjectId(String(h._id)));
		const additional = await this.hotelModel
			.find({
				hotelStatus: HotelStatus.ACTIVE,
				hotelLocation: location,
				_id: { $nin: existingIds } as any,
			})
			.sort({ hotelRank: -1, hotelRating: -1 })
			.limit(limit - locationFiltered.length)
			.exec();

		const result = [...locationFiltered, ...additional.map(toHotelDto)];
		await this.cacheManager.set(cacheKey, result, 900000);
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

		const hotels = await this.hotelModel.aggregate([
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
									$setIntersection: [
										{ $ifNull: ['$suitableFor', []] },
										sourceHotel.suitableFor || [],
									],
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

		const result = hotels.map((doc: any) => this.aggregateDocToHotelDto(doc));
		await this.cacheManager.set(cacheKey, result, 1800000); // 30 min
		return result;
	}

	/**
	 * Build user preference profile from search history, views, likes, and bookings
	 */
	private async buildUserProfile(memberId: string): Promise<UserPreferenceProfile> {
		const memberObjectId = new Types.ObjectId(memberId);

		const [searchAgg, viewedHotels, likedHotels, bookedHotels] = await Promise.all([
			// Aggregate search history
			this.searchHistoryModel.aggregate([
				{ $match: { memberId: memberObjectId } },
				{
					$group: {
						_id: null,
						locations: { $push: '$location' },
						hotelTypes: { $push: '$hotelTypes' },
						purposes: { $push: '$purpose' },
						amenities: { $push: '$amenities' },
						avgPriceMin: { $avg: '$priceMin' },
						avgPriceMax: { $avg: '$priceMax' },
					},
				},
			]),

			// Get viewed hotel IDs
			this.viewModel
				.find({ memberId: memberObjectId, viewGroup: ViewGroup.HOTEL })
				.select('viewRefId')
				.sort({ createdAt: -1 })
				.limit(50)
				.exec(),

			// Get liked hotel IDs
			this.likeModel
				.find({ memberId: memberObjectId, likeGroup: LikeGroup.HOTEL })
				.select('likeRefId')
				.exec(),

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

		// Extract top preferences from search history
		const searchData = searchAgg[0];

		const preferredLocations = searchData
			? this.getTopFrequent(searchData.locations.filter(Boolean), 3)
			: [];

		const preferredTypes = searchData
			? this.getTopFrequent(searchData.hotelTypes.flat().filter(Boolean), 3)
			: [];

		const preferredPurposes = searchData
			? this.getTopFrequent(searchData.purposes.filter(Boolean), 3)
			: [];

		const preferredAmenities = searchData
			? this.getTopFrequent(searchData.amenities.flat().filter(Boolean), 5)
			: [];

		// Enrich from booked hotels (strongest signal)
		if (bookedHotels.length > 0) {
			const bookedHotelDocs = await this.hotelModel
				.find({ _id: { $in: bookedHotels.map((b) => b.hotelId) } })
				.select('hotelLocation hotelType suitableFor')
				.exec();

			for (const hotel of bookedHotelDocs) {
				if (hotel.hotelLocation && !preferredLocations.includes(hotel.hotelLocation)) {
					preferredLocations.push(hotel.hotelLocation);
				}
				if (hotel.hotelType && !preferredTypes.includes(hotel.hotelType)) {
					preferredTypes.push(hotel.hotelType);
				}
				for (const purpose of hotel.suitableFor || []) {
					if (!preferredPurposes.includes(purpose)) {
						preferredPurposes.push(purpose);
					}
				}
			}
		}

		return {
			preferredLocations: preferredLocations.slice(0, 5),
			preferredTypes: preferredTypes.slice(0, 4),
			preferredPurposes: preferredPurposes.slice(0, 4),
			preferredAmenities: preferredAmenities.slice(0, 8),
			avgPriceMin: searchData?.avgPriceMin,
			avgPriceMax: searchData?.avgPriceMax,
			viewedHotelIds: viewedHotels.map((v) => v.viewRefId),
			likedHotelIds: likedHotels.map((l) => (l as any).likeRefId),
			bookedHotelIds: bookedHotels.map((b) => b.hotelId),
		};
	}

	/**
	 * Build the MongoDB aggregation pipeline for personalized recommendations
	 */
	private buildRecommendationPipeline(profile: UserPreferenceProfile, limit: number): any[] {
		const pipeline: any[] = [];

		// Stage 1: Only ACTIVE hotels
		pipeline.push({
			$match: {
				hotelStatus: HotelStatus.ACTIVE,
			},
		});

		// Stage 2: Exclude already-booked hotels
		if (profile.bookedHotelIds.length > 0) {
			pipeline.push({
				$match: {
					_id: { $nin: profile.bookedHotelIds },
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

		// Stage 4: Calculate scores
		const amenityScoreFields: any[] = profile.preferredAmenities.map((amenity) => ({
			$cond: [{ $eq: [`$amenities.${amenity}`, true] }, 2, 0],
		}));

		pipeline.push({
			$addFields: {
				locationScore: {
					$cond: [
						{ $in: ['$hotelLocation', profile.preferredLocations] },
						30,
						0,
					],
				},
				typeScore: {
					$cond: [
						{ $in: ['$hotelType', profile.preferredTypes] },
						15,
						0,
					],
				},
				purposeScore: {
					$multiply: [
						{
							$size: {
								$setIntersection: [
									{ $ifNull: ['$suitableFor', []] },
									profile.preferredPurposes,
								],
							},
						},
						10,
					],
				},
				amenityScore: amenityScoreFields.length > 0
					? { $add: amenityScoreFields }
					: 0,
				ratingScore: {
					$multiply: [{ $ifNull: ['$hotelRating', 0] }, 5],
				},
				popularityScore: {
					$min: [
						{
							$add: [
								{ $ifNull: ['$hotelViews', 0] },
								{ $multiply: [{ $ifNull: ['$hotelLikes', 0] }, 3] },
							],
						},
						10,
					],
				},
				likedBonus: {
					$cond: [
						{ $in: ['$_id', profile.likedHotelIds] },
						20,
						0,
					],
				},
				recencyBonus: {
					$cond: [
						{
							$gte: [
								'$updatedAt',
								new Date(Date.now() - 14 * 86400000),
							],
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
					],
				},
			},
		});

		// Stage 6: $facet — scored recommendations + fallback in one query
		pipeline.push({
			$facet: {
				// Primary: personalized scored results
				recommended: [
					{ $sort: { recommendationScore: -1, hotelRating: -1 } },
					{ $limit: limit },
				],
				// Fallback: top-rated hotels (used when scored results < limit)
				fallback: [
					{ $sort: { hotelRank: -1, hotelRating: -1 } },
					{ $limit: limit },
				],
			},
		});

		return pipeline;
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

	/**
	 * Convert aggregation result document to HotelDto
	 */
	private aggregateDocToHotelDto(doc: any): HotelDto {
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
			strikeHistory: (doc.strikeHistory || []).map((s: any) => ({
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
}
