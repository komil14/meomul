import type { Document, Types } from 'mongoose';
import { ViewDto } from '../dto/view/view';
import { ViewGroup } from '../enums/common.enum';

export interface ViewDocument extends Document {
	_id: Types.ObjectId;
	viewGroup: ViewGroup;
	viewRefId: Types.ObjectId;
	memberId: Types.ObjectId;
	createdAt: Date;
}

export function toViewDto(doc: ViewDocument): ViewDto {
	return {
		_id: doc._id as unknown as any,
		viewGroup: doc.viewGroup,
		viewRefId: doc.viewRefId as unknown as any,
		memberId: doc.memberId as unknown as any,
		createdAt: doc.createdAt,
	};
}
