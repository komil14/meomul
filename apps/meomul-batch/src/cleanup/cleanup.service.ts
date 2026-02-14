import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import type { NotificationDocument } from '../../../meomul-api/src/libs/types/notification';

@Injectable()
export class CleanupService {
	private readonly logger = new Logger(CleanupService.name);

	constructor(@InjectModel('Notification') private readonly notificationModel: Model<NotificationDocument>) {}

	/**
	 * Delete read notifications older than 30 days.
	 * Runs daily at 4:00 AM.
	 */
	@Cron('0 4 * * *')
	public async cleanOldNotifications(): Promise<void> {
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const result = await this.notificationModel
			.deleteMany({
				read: true,
				createdAt: { $lt: thirtyDaysAgo },
			})
			.exec();

		if (result.deletedCount > 0) {
			this.logger.log(`Cleaned up ${result.deletedCount} old notification(s)`);
		}
	}
}
