import type { Document, Types } from 'mongoose';
import { PriceLockDto } from '../dto/price-lock/price-lock';

export interface PriceLockDocument extends Document {
	_id: Types.ObjectId;
	userId: Types.ObjectId;
	roomId: Types.ObjectId;
	lockedPrice: number;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}

export function toPriceLockDto(doc: PriceLockDocument): PriceLockDto {
	return {
		_id: doc._id.toString(),
		userId: doc.userId.toString(),
		roomId: doc.roomId.toString(),
		lockedPrice: doc.lockedPrice,
		expiresAt: doc.expiresAt,
		createdAt: doc.createdAt,
	};
}
