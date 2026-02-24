import type { ClientSession, Document, Types } from 'mongoose';
import type { RoomInventoryDto } from '../dto/room-inventory/room-inventory';

export interface RoomInventoryDocument extends Document {
	_id: Types.ObjectId;
	roomId: Types.ObjectId;
	date: Date;
	total: number;
	booked: number;
	closed: boolean;
	basePrice?: number;
	overridePrice?: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface ReserveInventoryInput {
	roomId: string;
	checkInDate: Date;
	checkOutDate: Date;
	quantity: number;
	session?: ClientSession;
}

export interface SeedRoomInventoryInput {
	roomId: string;
	totalRooms: number;
	basePrice?: number;
	startDate: Date;
	days: number;
	session?: ClientSession;
}

export function toRoomInventoryDto(doc: RoomInventoryDocument): RoomInventoryDto {
	const total = doc.total ?? 0;
	const booked = doc.booked ?? 0;
	const available = Math.max(0, total - booked);
	const effectivePrice = doc.overridePrice ?? doc.basePrice;

	return {
		_id: doc._id as unknown as RoomInventoryDto['_id'],
		roomId: doc.roomId as unknown as RoomInventoryDto['roomId'],
		date: doc.date,
		total,
		booked,
		available,
		closed: doc.closed ?? false,
		basePrice: doc.basePrice,
		overridePrice: doc.overridePrice,
		effectivePrice,
		createdAt: doc.createdAt ?? new Date(),
		updatedAt: doc.updatedAt ?? new Date(),
	};
}
