import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import type { RoomDocument } from '../../../meomul-api/src/libs/types/room';

@Injectable()
export class DealService {
	private readonly logger = new Logger(DealService.name);

	constructor(@InjectModel('Room') private readonly roomModel: Model<RoomDocument>) {}

	/**
	 * Expire last-minute deals whose validUntil has passed.
	 * Runs every 10 minutes.
	 */
	@Cron(CronExpression.EVERY_10_MINUTES)
	public async expireDeals(): Promise<void> {
		const now = new Date();

		const result = await this.roomModel
			.updateMany(
				{
					'lastMinuteDeal.isActive': true,
					'lastMinuteDeal.validUntil': { $lt: now },
				},
				{
					$unset: { lastMinuteDeal: 1 },
				},
			)
			.exec();

		if (result.modifiedCount > 0) {
			this.logger.log(`Expired ${result.modifiedCount} last-minute deal(s)`);
		}
	}
}
