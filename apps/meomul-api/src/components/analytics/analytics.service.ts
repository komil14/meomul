import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { AnalyticsEventSearchInput } from '../../libs/dto/analytics/analytics-event-search.input';
import { TrackAnalyticsEventInput } from '../../libs/dto/analytics/track-analytics-event.input';
import { AnalyticsEventsDto } from '../../libs/dto/common/analytics-events';
import { Direction, PaginationInput } from '../../libs/dto/common/pagination';
import { Messages } from '../../libs/messages';
import type { MemberJwtPayload } from '../../libs/types/member';
import type { AnalyticsEventDocument } from '../../libs/types/analytics-event';
import { toAnalyticsEventDto } from '../../libs/types/analytics-event';

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

	public async getAnalyticsEventsAdmin(
		input: PaginationInput,
		search?: AnalyticsEventSearchInput,
	): Promise<AnalyticsEventsDto> {
		const { page, limit } = input;
		const skip = (page - 1) * limit;

		const filter: Record<string, unknown> = {};
		const eventName = this.normalizeText(search?.eventName, 120);
		const memberId = this.normalizeText(search?.memberId, 50);
		const source = this.normalizeText(search?.source, 50);

		if (eventName) {
			filter.eventName = eventName;
		}
		if (memberId) {
			if (!Types.ObjectId.isValid(memberId)) {
				throw new BadRequestException(Messages.BAD_REQUEST);
			}
			filter.memberId = new Types.ObjectId(memberId);
		}
		if (search?.memberType) {
			filter.memberType = search.memberType;
		}
		if (source) {
			filter.source = source;
		}

		const fromDate = this.parseDateFilter(search?.fromDate, false);
		const toDate = this.parseDateFilter(search?.toDate, true);
		if (fromDate && toDate && fromDate > toDate) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}
		if (fromDate || toDate) {
			filter.createdAt = {
				...(fromDate ? { $gte: fromDate } : {}),
				...(toDate ? { $lte: toDate } : {}),
			};
		}

		const sortField = this.resolveSortField(input.sort);
		const sortDirection = input.direction === Direction.ASC ? Direction.ASC : Direction.DESC;

		const [list, total] = await Promise.all([
			this.analyticsEventModel
				.find(filter)
				.sort({ [sortField]: sortDirection })
				.skip(skip)
				.limit(limit)
				.exec(),
			this.analyticsEventModel.countDocuments(filter).exec(),
		]);

		return {
			list: list.map(toAnalyticsEventDto),
			metaCounter: { total },
		};
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

	private parseDateFilter(value: string | undefined, endOfDay: boolean): Date | undefined {
		if (!value) {
			return undefined;
		}

		const normalized = value.trim();
		if (!normalized) {
			return undefined;
		}

		let parsedDate: Date;
		if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
			parsedDate = new Date(`${normalized}T00:00:00.000Z`);
			if (endOfDay) {
				parsedDate.setUTCHours(23, 59, 59, 999);
			}
		} else {
			parsedDate = new Date(normalized);
		}

		if (Number.isNaN(parsedDate.getTime())) {
			throw new BadRequestException(Messages.BAD_REQUEST);
		}

		return parsedDate;
	}

	private resolveSortField(sort: string | undefined): string {
		const allowedSortFields = new Set(['createdAt', 'eventName', 'memberType', 'source']);
		if (!sort || !allowedSortFields.has(sort)) {
			return 'createdAt';
		}

		return sort;
	}
}
