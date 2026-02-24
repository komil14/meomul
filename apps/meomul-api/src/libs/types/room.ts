import type { Document, Types } from 'mongoose';
import type { RoomDto, LastMinuteDealDto } from '../dto/room/room';
import { BedType, RoomStatus, RoomType, ViewType } from '../enums/room.enum';

function asFiniteNumber(value: unknown): number | null {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value;
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
}

function toLastMinuteDeal(value: unknown): LastMinuteDealDto | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	const isActive = typeof raw.isActive === 'boolean' ? raw.isActive : null;
	const discountPercent = asFiniteNumber(raw.discountPercent);
	const originalPrice = asFiniteNumber(raw.originalPrice);
	const dealPrice = asFiniteNumber(raw.dealPrice);
	const validUntil = asDate(raw.validUntil);

	if (isActive === null || discountPercent === null || originalPrice === null || dealPrice === null || !validUntil) {
		return undefined;
	}

	return {
		isActive,
		discountPercent,
		originalPrice,
		dealPrice,
		validUntil,
	};
}

/**
 * Mongoose Document type for Room
 */
export interface RoomDocument extends Document {
	_id: Types.ObjectId;
	hotelId: Types.ObjectId;
	roomType: RoomDto['roomType'];
	roomNumber?: string;
	roomName: string;
	roomDesc: string;
	maxOccupancy: number;
	bedType: RoomDto['bedType'];
	bedCount: number;
	basePrice: number;
	weekendSurcharge: number;
	roomSize: number;
	viewType: RoomDto['viewType'];
	roomAmenities: string[];
	totalRooms: number;
	availableRooms: number;
	currentViewers: number;
	lastMinuteDeal?: {
		isActive: boolean;
		discountPercent: number;
		originalPrice: number;
		dealPrice: number;
		validUntil: Date;
	};
	roomImages: string[];
	roomStatus: RoomDto['roomStatus'];
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Convert Mongoose RoomDocument to RoomDto
 */
export function toRoomDto(doc: RoomDocument): RoomDto {
	const totalRooms = doc.totalRooms ?? 1;
	const availableRooms = doc.availableRooms ?? totalRooms;

	return {
		_id: doc._id as unknown as RoomDto['_id'],
		hotelId: doc.hotelId as unknown as RoomDto['hotelId'],
		roomType: doc.roomType ?? RoomType.STANDARD,
		roomNumber: doc.roomNumber,
		roomName: doc.roomName ?? 'Room',
		roomDesc: doc.roomDesc ?? '',
		maxOccupancy: doc.maxOccupancy ?? 1,
		bedType: doc.bedType ?? BedType.SINGLE,
		bedCount: doc.bedCount ?? 1,
		basePrice: doc.basePrice ?? 0,
		weekendSurcharge: doc.weekendSurcharge ?? 0,
		roomSize: doc.roomSize ?? 0,
		viewType: doc.viewType ?? ViewType.NONE,
		roomAmenities: doc.roomAmenities ?? [],
		totalRooms,
		availableRooms,
		currentViewers: doc.currentViewers ?? 0,
		lastMinuteDeal: toLastMinuteDeal(doc.lastMinuteDeal as unknown),
		roomImages: doc.roomImages ?? [],
		roomStatus: doc.roomStatus ?? RoomStatus.AVAILABLE,
		createdAt: doc.createdAt ?? new Date(),
		updatedAt: doc.updatedAt ?? new Date(),
	};
}
