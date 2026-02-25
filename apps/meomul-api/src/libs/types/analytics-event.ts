import type { Document, Types } from 'mongoose';
import { AnalyticsEventDto } from '../dto/analytics/analytics-event';
import type { MemberType } from '../enums/member.enum';

export interface AnalyticsEventDocument extends Document {
	_id: Types.ObjectId;
	memberId: Types.ObjectId;
	memberType: MemberType;
	eventName: string;
	eventPath?: string;
	payload?: string;
	source?: string;
	userAgent?: string;
	createdAt: Date;
	updatedAt: Date;
}

export function toAnalyticsEventDto(doc: AnalyticsEventDocument): AnalyticsEventDto {
	return {
		_id: doc._id.toString(),
		memberId: doc.memberId.toString(),
		memberType: doc.memberType,
		eventName: doc.eventName,
		eventPath: doc.eventPath,
		payload: doc.payload,
		source: doc.source,
		userAgent: doc.userAgent,
		createdAt: doc.createdAt,
	};
}
