import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import type { Model } from 'mongoose';
import { MemberStatus } from '../../../meomul-api/src/libs/enums/member.enum';
import { SubscriptionTier } from '../../../meomul-api/src/libs/enums/member.enum';
import type { MemberDocument } from '../../../meomul-api/src/libs/types/member';

@Injectable()
export class SubscriptionService {
	private readonly logger = new Logger(SubscriptionService.name);

	constructor(@InjectModel('Member') private readonly memberModel: Model<MemberDocument>) {}

	/**
	 * Downgrade members whose subscription has expired back to FREE tier.
	 * Runs daily at 1:00 AM.
	 */
	@Cron('0 1 * * *')
	public async expireSubscriptions(): Promise<void> {
		const now = new Date();

		const result = await this.memberModel
			.updateMany(
				{
					subscriptionTier: { $ne: SubscriptionTier.FREE },
					subscriptionExpiry: { $lt: now, $ne: null },
					memberStatus: { $ne: MemberStatus.DELETE },
				},
				{
					$set: {
						subscriptionTier: SubscriptionTier.FREE,
						subscriptionExpiry: null,
					},
				},
			)
			.exec();

		if (result.modifiedCount > 0) {
			this.logger.log(`Expired ${result.modifiedCount} subscription(s), downgraded to FREE`);
		}
	}
}
