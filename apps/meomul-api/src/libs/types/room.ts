import type { Document, Types } from 'mongoose';
import type { RoomDto, LastMinuteDealDto } from '../dto/room/room';

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
	return {
		_id: doc._id as unknown as RoomDto['_id'],
		hotelId: doc.hotelId as unknown as RoomDto['hotelId'],
		roomType: doc.roomType,
		roomNumber: doc.roomNumber,
		roomName: doc.roomName,
		roomDesc: doc.roomDesc,
		maxOccupancy: doc.maxOccupancy,
		bedType: doc.bedType,
		bedCount: doc.bedCount,
		basePrice: doc.basePrice,
		weekendSurcharge: doc.weekendSurcharge,
		roomSize: doc.roomSize,
		viewType: doc.viewType,
		roomAmenities: doc.roomAmenities,
		totalRooms: doc.totalRooms,
		availableRooms: doc.availableRooms,
		currentViewers: doc.currentViewers,
		lastMinuteDeal: doc.lastMinuteDeal as LastMinuteDealDto | undefined,
		roomImages: doc.roomImages,
		roomStatus: doc.roomStatus,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};
}
