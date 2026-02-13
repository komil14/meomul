import type { Document, Types } from 'mongoose';
import { FollowDto } from '../dto/follow/follow';

export interface FollowDocument extends Document {
	_id: Types.ObjectId;
	followerId: Types.ObjectId;
	followingId: Types.ObjectId;
	createdAt: Date;
	updatedAt: Date;
}

export function toFollowDto(doc: FollowDocument): FollowDto {
	return {
		_id: doc._id as unknown as any,
		followerId: doc.followerId as unknown as any,
		followingId: doc.followingId as unknown as any,
		createdAt: doc.createdAt,
	};
}
