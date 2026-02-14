import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import type { PriceLockDocument } from '../../../meomul-api/src/libs/types/price-lock';

@Injectable()
export class PriceLockService {
	private readonly logger = new Logger(PriceLockService.name);

	constructor(@InjectModel('PriceLock') private readonly priceLockModel: Model<PriceLockDocument>) {}

	/**
	 * Safety net: delete expired price locks that the TTL index may have missed.
	 * TTL index has a 1-hour grace period; this catches anything older than 2 hours.
	 * Runs every 30 minutes.
	 */
	@Cron('*/30 * * * *')
	public async cleanExpiredLocks(): Promise<void> {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

		const result = await this.priceLockModel
			.deleteMany({
				expiresAt: { $lt: twoHoursAgo },
			})
			.exec();

		if (result.deletedCount > 0) {
			this.logger.log(`Cleaned ${result.deletedCount} orphaned price lock(s)`);
		}
	}
}
