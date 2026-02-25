import type { Document, Types } from 'mongoose';
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
