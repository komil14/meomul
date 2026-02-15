import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { HotelStatus, HotelLocation } from '../../../meomul-api/src/libs/enums/hotel.enum';
import { ViewGroup, LikeGroup } from '../../../meomul-api/src/libs/enums/common.enum';
import { BookingStatus } from '../../../meomul-api/src/libs/enums/booking.enum';
import { toHotelDto } from '../../../meomul-api/src/libs/types/hotel';
import type { ViewDocument } from '../../../meomul-api/src/libs/types/view';

interface RecommendationCacheDocument {
	_id: any;
	cacheKey: string;
	data: any;
	computedAt: Date;
	expiresAt: Date;
}

@Injectable()
export class RecommendationService {
	private readonly logger = new Logger(RecommendationService.name);

	constructor(
		@InjectModel('View') private readonly viewModel: Model<ViewDocument>,
		@InjectModel('RecommendationCache') private readonly cacheModel: Model<RecommendationCacheDocument>,
	) {}

	/**
	 * Pre-compute global + per-location trending hotels every hour.
	 */
	@Cron('0 * * * *')
	public async preComputeTrending(): Promise<void> {
		this.logger.log('Starting trending hotel pre-computation...');

		const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
		const expiresAt = new Date(Date.now() + 2 * 3600000); // 2 hours

		// Single pipeline: $unionWith merges views + likes + bookings,
		// then $group sums weighted scores, then $lookup hotel data
		const trendingResults = await this.viewModel.aggregate([
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
		const globalTrending = trendingResults.map((doc: any) => toHotelDto(doc));

		// Save global trending
		await this.cacheModel.updateOne(
			{ cacheKey: 'trending' },
			{ $set: { data: globalTrending, computedAt: new Date(), expiresAt } },
			{ upsert: true },
		);

		// Build per-location trending from aggregation results
		const locationGroups = new Map<string, any[]>();
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

		this.logger.log(
			`Pre-computed trending: ${globalTrending.length} global, ${locationGroups.size} location(s)`,
		);
	}
}
