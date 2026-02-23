import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { HotelDto } from '../../../meomul-api/src/libs/dto/hotel/hotel';
import { HotelStatus, HotelLocation } from '../../../meomul-api/src/libs/enums/hotel.enum';
import { ViewGroup, LikeGroup } from '../../../meomul-api/src/libs/enums/common.enum';
import { BookingStatus } from '../../../meomul-api/src/libs/enums/booking.enum';
import { toHotelDto } from '../../../meomul-api/src/libs/types/hotel';
import type { HotelDocument } from '../../../meomul-api/src/libs/types/hotel';
import type { ViewDocument } from '../../../meomul-api/src/libs/types/view';
import type { BookingDocument } from '../../../meomul-api/src/libs/types/booking';
import type { SearchHistoryDocument } from '../../../meomul-api/src/libs/types/search-history';
import { CronLockService } from '../common/cron-lock.service';

interface LikeDoc {
	_id: Types.ObjectId;
	likeGroup: LikeGroup;
	likeRefId: Types.ObjectId;
	memberId: Types.ObjectId;
	createdAt: Date;
}

interface UserProfileDoc {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	preferredLocations: string[];
	preferredTypes: string[];
	preferredPurposes: string[];
	preferredAmenities: string[];
	avgPriceMin?: number;
	avgPriceMax?: number;
	viewedHotelIds: Types.ObjectId[];
	likedHotelIds: Types.ObjectId[];
	bookedHotelIds: Types.ObjectId[];
	source?: string;
	computedAt: Date;
}

interface RecommendationCacheDocument {
	_id: Types.ObjectId;
	cacheKey: string;
	data: unknown;
	computedAt: Date;
	expiresAt: Date;
}

interface ActiveUserId {
	_id: Types.ObjectId;
}

type TrendingHotelDocument = HotelDocument & { hotelLocation?: HotelLocation; trendingScore: number };

@Injectable()
export class RecommendationService {
	private readonly logger = new Logger(RecommendationService.name);

	constructor(
		@InjectModel('View') private readonly viewModel: Model<ViewDocument>,
		@InjectModel('Like') private readonly likeModel: Model<LikeDoc>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('SearchHistory') private readonly searchHistoryModel: Model<SearchHistoryDocument>,
		@InjectModel('UserProfile') private readonly userProfileModel: Model<UserProfileDoc>,
		@InjectModel('RecommendationCache') private readonly cacheModel: Model<RecommendationCacheDocument>,
		private readonly cronLockService: CronLockService,
	) {}

	/**
	 * Pre-compute global + per-location trending hotels every hour.
	 */
	@Cron('0 * * * *')
	public async preComputeTrending(): Promise<void> {
		await this.cronLockService.runLocked('recommendation.preComputeTrending', 55 * 60 * 1000, async () => {
			this.logger.log('Starting trending hotel pre-computation...');

			const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
			const expiresAt = new Date(Date.now() + 2 * 3600000); // 2 hours

			// Single pipeline: $unionWith merges views + likes + bookings,
			// then $group sums weighted scores, then $lookup hotel data
			const trendingResults = await this.viewModel.aggregate<TrendingHotelDocument>([
				// Views (weight: 1)
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

				// Group by hotel and sum weighted scores
				{
					$group: {
						_id: '$hotelId',
						trendingScore: { $sum: '$weight' },
					},
				},

				// Sort by score and take top 50
				{ $sort: { trendingScore: -1 as const } },
				{ $limit: 50 },

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

				// Promote hotel fields to root, keep score
				{ $replaceRoot: { newRoot: { $mergeObjects: ['$hotel', { trendingScore: '$trendingScore' }] } } },
			]);

			// Build global trending list
			const globalTrending = trendingResults.map((doc) => toHotelDto(doc));

			// Save global trending
			await this.cacheModel.updateOne(
				{ cacheKey: 'trending' },
				{ $set: { data: globalTrending, computedAt: new Date(), expiresAt } },
				{ upsert: true },
			);

			// Build per-location trending from aggregation results
			const locationGroups = new Map<string, HotelDto[]>();
			for (const doc of trendingResults) {
				const loc = doc.hotelLocation;
				if (!loc) continue;
				if (!locationGroups.has(loc)) locationGroups.set(loc, []);
				locationGroups.get(loc)!.push(toHotelDto(doc));
			}

			// Save per-location trending (for all known locations)
			const bulkOps = Object.values(HotelLocation).map((location) => ({
				updateOne: {
					filter: { cacheKey: `trending:${location}` },
					update: {
						$set: {
							data: locationGroups.get(location) || [],
							computedAt: new Date(),
							expiresAt,
						},
					},
					upsert: true,
				},
			}));

			if (bulkOps.length > 0) {
				await this.cacheModel.bulkWrite(bulkOps);
			}

			this.logger.log(`Pre-computed trending: ${globalTrending.length} global, ${locationGroups.size} location(s)`);
		});
	}

	/**
	 * Pre-compute user preference profiles every hour (30 min offset from trending).
	 * Only processes users with recent activity (last 30 days).
	 */
	@Cron('30 * * * *')
	public async preComputeUserProfiles(): Promise<void> {
		await this.cronLockService.runLocked('recommendation.preComputeUserProfiles', 55 * 60 * 1000, async () => {
			this.logger.log('Starting user profile pre-computation...');

			const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
			const now = Date.now();

			// Find users with recent activity (searched, viewed, liked, or booked)
			const activeUserIds = await this.viewModel.aggregate<ActiveUserId>([
				{ $match: { viewGroup: ViewGroup.HOTEL, createdAt: { $gte: thirtyDaysAgo } } },
				{ $group: { _id: '$memberId' } },
				{
					$unionWith: {
						coll: 'likes',
						pipeline: [
							{ $match: { likeGroup: LikeGroup.HOTEL, createdAt: { $gte: thirtyDaysAgo } } },
							{ $group: { _id: '$memberId' } },
						],
					},
				},
				{
					$unionWith: {
						coll: 'searchhistories',
						pipeline: [{ $match: { createdAt: { $gte: thirtyDaysAgo } } }, { $group: { _id: '$memberId' } }],
					},
				},
				{ $group: { _id: '$_id' } },
			]);

			const memberIds = activeUserIds.map((u) => u._id);
			this.logger.log(`Found ${memberIds.length} active user(s) to process`);

			let processed = 0;
			const concurrency = Math.max(1, Number(process.env.BATCH_PROFILE_CONCURRENCY ?? 8));

			for (let i = 0; i < memberIds.length; i += concurrency) {
				const chunk = memberIds.slice(i, i + concurrency);
				const results = await Promise.all(chunk.map((memberId) => this.computeProfileForMember(memberId, now)));
				processed += results.filter(Boolean).length;
			}

			this.logger.log(`Pre-computed ${processed} user profile(s)`);
		});
	}

	private async computeProfileForMember(memberId: Types.ObjectId, now: number): Promise<boolean> {
		try {
			// Check if existing profile is from onboarding — only overwrite if user has sufficient behavioral data
			const existingProfile = await this.userProfileModel.findOne({ memberId }).select('source').lean().exec();

			if (existingProfile && existingProfile.source === 'onboarding') {
				const [searchCount, viewCount, likeCount, bookingCount] = await Promise.all([
					this.searchHistoryModel.countDocuments({ memberId }),
					this.viewModel.countDocuments({ memberId, viewGroup: ViewGroup.HOTEL }),
					this.likeModel.countDocuments({ memberId, likeGroup: LikeGroup.HOTEL }),
					this.bookingModel.countDocuments({
						guestId: memberId,
						bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
					}),
				]);

				const hasSufficientData = searchCount >= 5 || viewCount >= 3 || likeCount >= 1 || bookingCount >= 1;
				if (!hasSufficientData) {
					return false; // Keep onboarding data, skip this user
				}
			}

			// Fetch search history with time-decay
			const searchHistory = await this.searchHistoryModel
				.find({ memberId })
				.select('location hotelTypes purpose amenities priceMin priceMax createdAt')
				.sort({ createdAt: -1 })
				.limit(200)
				.lean()
				.exec();

			const [viewedHotels, likedHotels, bookedHotels] = await Promise.all([
				this.viewModel
					.find({ memberId, viewGroup: ViewGroup.HOTEL })
					.select('viewRefId')
					.sort({ createdAt: -1 })
					.limit(50)
					.lean()
					.exec(),
				this.likeModel.find({ memberId, likeGroup: LikeGroup.HOTEL }).select('likeRefId').lean().exec(),
				this.bookingModel
					.find({
						guestId: memberId,
						bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
					})
					.select('hotelId')
					.sort({ createdAt: -1 })
					.limit(20)
					.lean()
					.exec(),
			]);

			// Time-decay weighted preferences
			const weightedLocations: string[] = [];
			const weightedTypes: string[] = [];
			const weightedPurposes: string[] = [];
			const weightedAmenities: string[] = [];
			let totalPriceWeight = 0;
			let weightedPriceMin = 0;
			let weightedPriceMax = 0;

			for (const search of searchHistory) {
				const ageMs = now - new Date(search.createdAt).getTime();
				const weight = this.getTimeDecayWeight(ageMs);
				const repeatCount = Math.max(1, Math.round(weight * 5));

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

			const preferredLocations = this.getTopFrequent(weightedLocations.filter(Boolean), 5);
			const preferredTypes = this.getTopFrequent(weightedTypes.filter(Boolean), 4);
			const preferredPurposes = this.getTopFrequent(weightedPurposes.filter(Boolean), 4);
			const preferredAmenities = this.getTopFrequent(weightedAmenities.filter(Boolean), 8);

			// Enrich from booked hotels
			if (bookedHotels.length > 0) {
				const bookedHotelIds = bookedHotels.map((b) => b.hotelId);
				const bookedHotelDocs = await this.hotelModel
					.find({ _id: { $in: bookedHotelIds } })
					.select('hotelLocation hotelType suitableFor')
					.lean()
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

			// Upsert the computed profile
			await this.userProfileModel.updateOne(
				{ memberId },
				{
					$set: {
						preferredLocations: preferredLocations.slice(0, 5),
						preferredTypes: preferredTypes.slice(0, 4),
						preferredPurposes: preferredPurposes.slice(0, 4),
						preferredAmenities: preferredAmenities.slice(0, 8),
						avgPriceMin: totalPriceWeight > 0 ? weightedPriceMin / totalPriceWeight : undefined,
						avgPriceMax: totalPriceWeight > 0 ? weightedPriceMax / totalPriceWeight : undefined,
						viewedHotelIds: viewedHotels.map((v) => v.viewRefId),
						likedHotelIds: likedHotels.map((l) => l.likeRefId),
						bookedHotelIds: bookedHotels.map((b) => b.hotelId),
						source: 'computed',
						computedAt: new Date(),
					},
				},
				{ upsert: true },
			);

			return true;
		} catch (err) {
			this.logger.error(`Failed to compute profile for member ${memberId.toString()}`, err);
			return false;
		}
	}

	private getTimeDecayWeight(ageMs: number): number {
		const hours = ageMs / 3600000;
		if (hours < 24) return 1.0;
		if (hours < 72) return 0.8;
		if (hours < 168) return 0.5;
		if (hours < 720) return 0.2;
		return 0.05;
	}

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
}
