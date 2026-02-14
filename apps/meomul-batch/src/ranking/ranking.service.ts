import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model, AnyBulkWriteOperation } from 'mongoose';
import type { HotelDocument } from '../../../meomul-api/src/libs/types/hotel';
import type { ReviewDocument } from '../../../meomul-api/src/libs/types/review';
import type { MemberDocument } from '../../../meomul-api/src/libs/types/member';

@Injectable()
export class RankingService {
	private readonly logger = new Logger(RankingService.name);

	constructor(
		@InjectModel('Hotel') private readonly hotelModel: Model<HotelDocument>,
		@InjectModel('Review') private readonly reviewModel: Model<ReviewDocument>,
		@InjectModel('Member') private readonly memberModel: Model<MemberDocument>,
	) {}

	/**
	 * Recalculate hotel ratings and ranks based on reviews.
	 * hotelRating = average overallRating across approved reviews.
	 * hotelRank = rating * log(reviewCount + 1) + hotelViews / 1000.
	 * Runs daily at 3:00 AM.
	 */
	@Cron('0 3 * * *')
	public async recalculateHotelRanking(): Promise<void> {
		const reviewAggregation = await this.reviewModel
			.aggregate([
				{ $match: { reviewStatus: 'APPROVED' } },
				{
					$group: {
						_id: '$hotelId',
						avgRating: { $avg: '$overallRating' },
						reviewCount: { $sum: 1 },
					},
				},
			])
			.exec();

		if (reviewAggregation.length === 0) {
			this.logger.log('No reviews found for hotel ranking recalculation');
			return;
		}

		const bulkOps: AnyBulkWriteOperation<HotelDocument>[] = [];

		for (const entry of reviewAggregation) {
			const rating = Math.round(entry.avgRating * 10) / 10;

			// Get hotel views for rank calculation
			const hotel = await this.hotelModel.findById(entry._id).select('hotelViews').exec();
			const views = hotel?.hotelViews ?? 0;

			const rank = Math.round(rating * Math.log(entry.reviewCount + 1) * 100 + views / 10) / 100;

			bulkOps.push({
				updateOne: {
					filter: { _id: entry._id },
					update: {
						hotelRating: rating,
						hotelRank: rank,
						hotelReviews: entry.reviewCount,
					},
				},
			});
		}

		if (bulkOps.length > 0) {
			await this.hotelModel.bulkWrite(bulkOps);
			this.logger.log(`Recalculated ranking for ${bulkOps.length} hotel(s)`);
		}
	}

	/**
	 * Recalculate member ranks based on activity.
	 * memberRank = memberLikes + memberFollowers * 2 + memberArticles * 3 + memberComments.
	 * Runs daily at 3:30 AM.
	 */
	@Cron('30 3 * * *')
	public async recalculateMemberRanking(): Promise<void> {
		const members = await this.memberModel
			.find()
			.select('memberLikes memberFollowers memberArticles memberComments memberRank')
			.exec();

		const bulkOps: AnyBulkWriteOperation<MemberDocument>[] = [];

		for (const member of members) {
			const newRank =
				(member.memberLikes ?? 0) +
				(member.memberFollowers ?? 0) * 2 +
				(member.memberArticles ?? 0) * 3 +
				(member.memberComments ?? 0);

			if (newRank !== member.memberRank) {
				bulkOps.push({
					updateOne: {
						filter: { _id: member._id },
						update: { memberRank: newRank },
					},
				});
			}
		}

		if (bulkOps.length > 0) {
			await this.memberModel.bulkWrite(bulkOps);
			this.logger.log(`Recalculated ranking for ${bulkOps.length} member(s)`);
		}
	}
}
