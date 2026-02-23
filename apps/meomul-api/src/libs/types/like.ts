import type { Document, Types } from 'mongoose';
import { LikeDto } from '../dto/like/like';
import { LikeGroup } from '../enums/common.enum';

export interface LikeDocument extends Document {
	_id: Types.ObjectId;
	likeGroup: LikeGroup;
	likeRefId: Types.ObjectId;
	memberId: Types.ObjectId;
	createdAt: Date;
}

export function toLikeDto(doc: LikeDocument): LikeDto {
	return {
		_id: doc._id as unknown as LikeDto['_id'],
		likeGroup: doc.likeGroup,
		likeRefId: doc.likeRefId as unknown as LikeDto['likeRefId'],
		memberId: doc.memberId as unknown as LikeDto['memberId'],
		createdAt: doc.createdAt,
	};
}
