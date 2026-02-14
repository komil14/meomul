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
		_id: doc._id as unknown as any,
		userId: doc.userId as unknown as any,
		roomId: doc.roomId as unknown as any,
		lockedPrice: doc.lockedPrice,
		expiresAt: doc.expiresAt,
		createdAt: doc.createdAt,
	};
}
