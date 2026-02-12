import type { Document, Types } from 'mongoose';
import type { RoomDto, LastMinuteDealDto } from '../dto/room/room';

/**
 * Mongoose Document type for Room
 */
export interface RoomDocument extends Document {
	_id: Types.ObjectId;
	hotelId: Types.ObjectId;
	roomType: string;
	roomNumber?: string;
	roomName: string;
	roomDesc: string;
	maxOccupancy: number;
	bedType: string;
	bedCount: number;
	basePrice: number;
	weekendSurcharge: number;
	roomSize: number;
	viewType: string;
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
	roomStatus: string;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Convert Mongoose RoomDocument to RoomDto
 */
export function toRoomDto(doc: RoomDocument): RoomDto {
	return {
		_id: doc._id as unknown as any,
		hotelId: doc.hotelId as unknown as any,
		roomType: doc.roomType as any,
		roomNumber: doc.roomNumber,
		roomName: doc.roomName,
		roomDesc: doc.roomDesc,
		maxOccupancy: doc.maxOccupancy,
		bedType: doc.bedType as any,
		bedCount: doc.bedCount,
		basePrice: doc.basePrice,
		weekendSurcharge: doc.weekendSurcharge,
		roomSize: doc.roomSize,
		viewType: doc.viewType as any,
		roomAmenities: doc.roomAmenities,
		totalRooms: doc.totalRooms,
		availableRooms: doc.availableRooms,
		currentViewers: doc.currentViewers,
		lastMinuteDeal: doc.lastMinuteDeal as LastMinuteDealDto | undefined,
		roomImages: doc.roomImages,
		roomStatus: doc.roomStatus as any,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
