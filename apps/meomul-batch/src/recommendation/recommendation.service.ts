import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { HotelStatus, HotelLocation } from '../../../meomul-api/src/libs/enums/hotel.enum';
import { ViewGroup, LikeGroup } from '../../../meomul-api/src/libs/enums/common.enum';
import { BookingStatus } from '../../../meomul-api/src/libs/enums/booking.enum';
import type { HotelDocument } from '../../../meomul-api/src/libs/types/hotel';
import { toHotelDto } from '../../../meomul-api/src/libs/types/hotel';
import type { ViewDocument } from '../../../meomul-api/src/libs/types/view';
import type { BookingDocument } from '../../../meomul-api/src/libs/types/booking';

interface LikeDocument {
	_id: Types.ObjectId;
	likeGroup: string;
	likeRefId: Types.ObjectId;
	memberId: Types.ObjectId;
	createdAt: Date;
}

interface RecommendationCacheDocument {
	_id: Types.ObjectId;
	cacheKey: string;
	data: any;
	computedAt: Date;
	expiresAt: Date;
}

@Injectable()
export class RecommendationService {
	private readonly logger = new Logger(RecommendationService.name);

	constructor(
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('View') private readonly viewModel: Model<ViewDocument>,
		@InjectModel('Like') private readonly likeModel: Model<LikeDocument>,
		@InjectModel('Booking') private readonly bookingModel: Model<BookingDocument>,
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

		const [recentViews, recentLikes, recentBookings] = await Promise.all([
			this.viewModel.aggregate([
				{ $match: { viewGroup: ViewGroup.HOTEL, createdAt: { $gte: sevenDaysAgo } } },
				{ $group: { _id: '$viewRefId', count: { $sum: 1 } } },
			]),
			this.likeModel.aggregate([
				{ $match: { likeGroup: LikeGroup.HOTEL, createdAt: { $gte: sevenDaysAgo } } },
				{ $group: { _id: '$likeRefId', count: { $sum: 1 } } },
			]),
			this.bookingModel.aggregate([
				{
					$match: {
						createdAt: { $gte: sevenDaysAgo },
						bookingStatus: { $in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
					},
				},
				{ $group: { _id: '$hotelId', count: { $sum: 1 } } },
			]),
		]);

		// Merge scores: bookings × 5 + likes × 3 + views × 1
		const scoreMap = new Map<string, number>();
		for (const v of recentViews) scoreMap.set(String(v._id), (scoreMap.get(String(v._id)) || 0) + v.count);
		for (const l of recentLikes) scoreMap.set(String(l._id), (scoreMap.get(String(l._id)) || 0) + l.count * 3);
		for (const b of recentBookings) scoreMap.set(String(b._id), (scoreMap.get(String(b._id)) || 0) + b.count * 5);

		const sortedIds = Array.from(scoreMap.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 50)
			.map(([id]) => new Types.ObjectId(id));

		// Fetch hotels
		const hotels = await this.hotelModel
			.find({ _id: { $in: sortedIds }, hotelStatus: HotelStatus.ACTIVE })
			.exec();

		const hotelMap = new Map(hotels.map((h) => [String(h._id), h]));

		// Build global trending list
		const globalTrending: ReturnType<typeof toHotelDto>[] = [];
		for (const id of sortedIds) {
			const hotel = hotelMap.get(String(id));
			if (hotel) globalTrending.push(toHotelDto(hotel));
		}

		// Save global trending
		await this.cacheModel.updateOne(
			{ cacheKey: 'trending' },
			{ $set: { data: globalTrending, computedAt: new Date(), expiresAt } },
			{ upsert: true },
		);

		// Build per-location trending
		const locationGroups = new Map<string, any[]>();
		for (const id of sortedIds) {
			const hotel = hotelMap.get(String(id));
			if (!hotel) continue;
			const loc = hotel.hotelLocation;
			if (!locationGroups.has(loc)) locationGroups.set(loc, []);
			locationGroups.get(loc)!.push(toHotelDto(hotel));
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
