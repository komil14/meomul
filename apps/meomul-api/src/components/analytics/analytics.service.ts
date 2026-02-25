import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { TrackAnalyticsEventInput } from '../../libs/dto/analytics/track-analytics-event.input';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { AnalyticsEventDocument } from '../../libs/types/analytics-event';

@Injectable()
export class AnalyticsService {
	private readonly logger = new Logger(AnalyticsService.name);

	constructor(@InjectModel('AnalyticsEvent') private readonly analyticsEventModel: Model<AnalyticsEventDocument>) {}

	public async trackEvent(currentMember: MemberJwtPayload, input: TrackAnalyticsEventInput): Promise<boolean> {
		try {
			await this.analyticsEventModel.create({
				memberId: new Types.ObjectId(currentMember._id),
				memberType: currentMember.memberType,
				eventName: input.eventName.trim(),
				eventPath: this.normalizeText(input.eventPath, 500),
				payload: this.normalizeText(input.payload, 8000),
				source: this.normalizeText(input.source, 50) ?? 'web',
				userAgent: this.normalizeText(input.userAgent, 500),
			});

			return true;
		} catch (error) {
			this.logger.error('trackEvent failed', currentMember?._id ?? 'unknown', input.eventName, error);
			return false;
		}
	}

	private normalizeText(value: string | undefined, maxLength: number): string | undefined {
		if (!value) {
			return undefined;
		}

		const normalized = value.trim();
		if (!normalized) {
			return undefined;
		}

		return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
	}
}
